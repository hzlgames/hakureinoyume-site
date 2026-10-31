// Fixture UI checks; optional real requests use isolated review sessions, with no ASR worker running.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.REPLAY_TEST_URL||'http://127.0.0.1:3107',output=process.env.REPLAY_BROWSER_OUTPUT||'/tmp/hakurei-replay-browser';
const sessions=JSON.parse(await readFile(process.env.REPLAY_SESSION_FILE||'.data/validation/review-cookies.json','utf8'));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/home/ubuntu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
const checks=[];
try{
 const contexts=[];for(const session of sessions){const c=await browser.newContext({viewport:{width:1280,height:1000}});const split=session.cookie.indexOf('=');await c.addCookies([{name:session.cookie.slice(0,split),value:session.cookie.slice(split+1),url:base,httpOnly:true,sameSite:'Lax'}]);contexts.push(c);}
 if(process.env.REPLAY_REAL_API==='1'){
  const jobs=[];for(const context of contexts){const r=await context.request.post(base+'/api/zju/jobs',{headers:{origin:base},data:{tool:'classroom.zju/transcript',provider:'volcengine',courseId:'87601',subId:'2034357'}});assert.equal(r.status(),201);jobs.push((await r.json()).job);}
  assert.equal(jobs[0].replayTranscriptId,jobs[1].replayTranscriptId);assert.notEqual(jobs[0].id,jobs[1].id);
  const duplicate=await contexts[0].request.post(base+'/api/zju/jobs',{headers:{origin:base},data:{tool:'classroom.zju/transcript',provider:'volcengine',courseId:'87601',subId:'2034357'}});assert.equal((await duplicate.json()).job.id,jobs[0].id);
  assert.equal((await contexts[0].request.post(base+'/api/zju/jobs',{headers:{origin:'https://invalid.example'},data:{}})).status(),403);
  assert.equal((await contexts[1].request.get(base+`/api/zju/jobs/${jobs[0].id}`)).status(),404);
  for(const [i,job] of jobs.entries()){assert.equal((await contexts[i].request.delete(base+`/api/zju/jobs/${job.id}`,{headers:{origin:base}})).status(),200);assert.equal((await(await contexts[i].request.get(base+`/api/zju/jobs/${job.id}`)).json()).job.status,'cancelled');}
  checks.push('two existing users share one real queued lesson; duplicate request deduplicated; own cancellation and access isolation; cross-origin rejected');
 }
 const page=await contexts[0].newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let provider='',cancelled=false;
 const fakeJob=()=>({id:'replay-fixture',tool:'classroom.zju/transcript',status:cancelled?'cancelled':'running',createdAt:'2020-01-01T00:00:00Z',logs:'火山引擎 · 已保存一分钟字幕',error:null,persistentFiles:true,expiresAt:null,filesExpired:false,output:{provider:'volcengine',persistent:true,partial:true,files:[{name:'课堂字幕.srt',size:128},{name:'课堂转写.txt',size:96}]}});
 await page.route('**/api/zju/classroom/courses**',route=>route.fulfill({json:route.request().url().endsWith('/videos')?{videos:[{courseId:'87601',subId:'2034357',title:'证据法学 · 界面验证',startAt:1791975000,playbackUrl:'https://fixture.invalid/replay.mp4'}]}:{courses:[{id:'87601',title:'证据法学',teacher:'测试教师'}]}}));
 await page.route('**/api/zju/jobs**',async route=>{
  const request=route.request();if(request.method()==='POST'){provider=request.postDataJSON().provider;return route.fulfill({json:{job:fakeJob()}});}if(request.method()==='DELETE'){cancelled=true;return route.fulfill({json:{ok:true}});}
  if(request.url().includes('/files/'))return route.fulfill({body:'\ufeff1\n00:00:00,000 --> 00:00:01,000\n测试字幕\n',headers:{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('课堂字幕.srt')},contentType:'text/plain; charset=utf-8'});
  return route.fulfill({json:{jobs:[fakeJob()]}});
 });
 await page.goto(base+'/tools/ZJU_tools/classroom.zju',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'读取录播',exact:true}).click();
 await page.getByRole('button',{name:'导出智云转录',exact:true}).click();assert.equal(provider,'zhiyun');
 await page.getByLabel('导出转录来源').selectOption('volcengine');await page.getByRole('button',{name:'导出火山字幕',exact:true}).click();assert.equal(provider,'volcengine');checks.push('both export choices send the selected provider');
 await page.getByText('共享字幕长期保存',{exact:false}).waitFor();assert.ok(await page.getByRole('link',{name:/课堂字幕.srt/}).count());assert.equal(await page.getByText('文件已到期清理',{exact:false}).count(),0);checks.push('old persistent SRT/TXT remain downloadable without two-day expiry');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:/课堂字幕.srt/}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'课堂字幕.srt');checks.push('UTF-8 SRT download filename');
 for(const width of [1280,390]){await page.setViewportSize({width,height:1000});for(const theme of ['light','dark']){await page.evaluate(theme=>{localStorage.setItem('hakurei-color-mode',theme);window.dispatchEvent(new Event('site-theme-change'));},theme);await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/${width}-${theme}.png`,fullPage:true});}}
 await page.getByRole('button',{name:'中止我的转录请求',exact:true}).click();await page.getByText('已取消',{exact:true}).waitFor();assert.ok(cancelled);assert.ok(await page.getByRole('link',{name:/课堂转写.txt/}).count());await page.reload();await page.getByText('共享字幕长期保存',{exact:false}).waitFor();checks.push('cancelled export retains partial downloads after refresh');assert.deepEqual(errors,[]);
 const report={checks,browserErrors:errors,fixture:true,realApi:process.env.REPLAY_REAL_API==='1'};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 for(const c of contexts)await c.close();
}finally{await browser.close()}
