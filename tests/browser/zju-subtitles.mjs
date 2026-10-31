// Browser fixtures exercise player behavior. Optional real API checks use review-only sessions.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SUBTITLE_TEST_URL || 'http://127.0.0.1:3103';
const output = process.env.SUBTITLE_TEST_OUTPUT || '/tmp/hakurei-subtitle-browser';
const media = process.env.SUBTITLE_TEST_MEDIA || '/tmp/hakurei-subtitle-browser-media';
const sessions = JSON.parse(await readFile(process.env.SUBTITLE_SESSION_FILE || '/tmp/hakurei-subtitle-browser-cookies.json', 'utf8'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/home/ubuntu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1'] });
const checks = [];
try {
  const contexts = [];
  for (const session of sessions) {
    const context = await browser.newContext({viewport:{width:1280,height:1000}});
    const split = session.cookie.indexOf('=');
    await context.addCookies([{name:session.cookie.slice(0,split),value:session.cookie.slice(split+1),url:base,httpOnly:true,sameSite:'Lax'}]);contexts.push(context);
  }
  if (process.env.SUBTITLE_CHECK_REAL_API === '1') {
    const responses = await Promise.all(contexts.map(c=>c.request.get(base+'/api/zju/classroom/live/subtitles?courseId=87601&subId=2034357')));
    for(const r of responses)assert.equal(r.status(),200);
    const data=await Promise.all(responses.map(r=>r.json()));assert.equal(data[0].subtitle.id,data[1].subtitle.id);
    const guest=await browser.newContext();assert.equal((await guest.request.get(base+'/api/zju/classroom/live/subtitles?courseId=87601&subId=2034357')).status(),401);await guest.close();
    assert.equal((await contexts[0].request.post(base+'/api/zju/classroom/live/subtitles',{headers:{origin:'https://other.invalid'},data:{}})).status(),403);
    checks.push('two existing users read the same real persisted lesson; guest and cross-origin rejected');
  }
  const page = await contexts[0].newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let posts=0,polls=0;
  const cues=Array.from({length:40},(_,i)=>({id:`fixture-${i}`,startMs:i*1000+5000,endMs:(i+1)*1000+5000,text:`模拟字幕：第 ${i+1} 秒，验证字幕随播放进度变化。`,revision:1}));
  const segments=Array.from({length:40},(_,i)=>({sequence:i,startMs:i*1000,durationMs:1000,observedAt:new Date().toISOString()}));
  await page.route('**/__subtitle-test/**',async route=>{
    const name=basename(new URL(route.request().url()).pathname);assert.match(name,/^(playlist\.m3u8|segment\d+\.ts)$/);
    await route.fulfill({body:await readFile(`${media}/${name}`),contentType:name.endsWith('.ts')?'video/mp2t':'application/vnd.apple.mpegurl'});
  });
  await page.route('**/api/zju/classroom/live**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/subtitles')){
      if(route.request().method()==='POST'){posts++;return route.fulfill({json:{id:'browser-fixture',ok:true}});}
      polls++;return route.fulfill({json:{subtitle:{id:'browser-fixture',status:'running',title:'模拟字幕验证',partial:'模拟临时字幕：实时修订中。',partialStartMs:0,partialEndMs:5000,error:null,revision:1,expiresAt:new Date(Date.now()+604800000).toISOString(),audioMs:40000,viewers:2,cues:Number(url.searchParams.get('after'))<1?cues:[],segments,reset:Number(url.searchParams.get('after'))<0}}});
    }
    const lesson={courseId:'87601',subId:'2034357',title:'证据法学 · 模拟字幕验证',status:'1',type:'course_live',startAt:1791975000,room:'测试画面',playbackUrl:null};
    const action=url.searchParams.get('action');
    return route.fulfill({json:action==='streams'?{streams:[{name:'教师画面',url:`${base}/__subtitle-test/playlist.m3u8`,audioSource:'classroom'}]}:action==='courses'?{courses:[]}:{lessons:[lesson]}});
  });
  await page.goto(base+'/tools/ZJU_tools/classroom.zju/live?courseId=87601&subId=2034357',{waitUntil:'domcontentloaded'});
  const toggle=page.getByRole('button',{name:'字幕：关',exact:true});await toggle.waitFor({timeout:30000});await toggle.click();
  await page.getByText('字幕跟随播放进度',{exact:false}).waitFor({timeout:15000});
  await page.locator('video').evaluate(v=>v.play());
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>2,{timeout:15000});
  await page.waitForFunction(()=>document.querySelector('video')?.textTracks[0]?.activeCues?.[0]?.text.includes('模拟'));
  await page.locator('video').evaluate(v=>v.pause());
  await page.waitForTimeout(300);
  const paused=await page.locator('video').evaluate(v=>({time:v.currentTime,text:v.textTracks[0].activeCues[0]?.text}));
  await page.waitForTimeout(1500);
  assert.deepEqual(await page.locator('video').evaluate(v=>({time:v.currentTime,text:v.textTracks[0].activeCues[0]?.text})),paused);
  assert.match(paused.text, /临时字幕/); checks.push('HLS fragment synchronization, partial revisions and pause');
  await page.locator('.zju-subtitle-history summary').click();assert.equal(await page.locator('.zju-subtitle-transcript p').count(),40);
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:1000});
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>{localStorage.setItem('hakurei-color-mode',theme);window.dispatchEvent(new Event('site-theme-change'));},theme);
      await page.waitForTimeout(350);await page.screenshot({path:`${output}/${width===1280?'desktop':'mobile'}-${theme}.png`,fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal overflow');
    }
  }
  await page.setViewportSize({width:1280,height:1000});
  await page.locator('video').click();await page.locator('video').evaluate(v=>v.requestFullscreen());
  await page.waitForFunction(()=>!!document.fullscreenElement);
  assert.equal(await page.locator('video').evaluate(v=>v.textTracks[0].mode),'showing');
  await page.screenshot({path:`${output}/fullscreen.png`});
  await page.evaluate(()=>document.exitFullscreen());checks.push('native video fullscreen retains TextTrack');
  await page.waitForTimeout(4500);assert.equal(await page.locator('video').evaluate(v=>v.textTracks.length),1);checks.push('incremental polling keeps one subtitle track');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'字幕：开',exact:true}).waitFor({timeout:30000});
  await page.locator('.zju-subtitle-history summary').click();await page.waitForFunction(()=>document.querySelectorAll('.zju-subtitle-transcript p').length===40);checks.push('F5 restores selected lesson, subtitle preference and history');
  await page.getByRole('button',{name:'字幕：开',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>v.textTracks[0]?.mode),'disabled');
  assert.deepEqual(errors,[]);checks.push('subtitle switch hides captions; no browser errors');
  const report={checks,fixture:true,posts,polls,screenshots:output,browserErrors:errors};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  for(const context of contexts)await context.close();
}finally{await browser.close();}
