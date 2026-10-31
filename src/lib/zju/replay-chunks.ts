import type { RecordingCue } from "./asr/recording";
export const REPLAY_OVERLAP_MS = 1500;
// Find a >=300ms low-energy pause in the last 15s; no extra audio/network buffering.
export function pauseAlignedPcm(pcm: Buffer, final: boolean) {
  const durationMs = pcm.length / 32;
  if (final || durationMs < 45000) return pcm;
  const frameSamples = 320, frameBytes = frameSamples*2;
  let silenceStart = -1, best = -1;
  for (let offset = Math.floor(45000*32/frameBytes)*frameBytes; offset+frameBytes <= pcm.length; offset += frameBytes) {
    let square = 0;
    for(let i=offset;i<offset+frameBytes;i+=2){const sample=pcm.readInt16LE(i)/32768;square+=sample*sample;}
    const quiet = Math.sqrt(square/frameSamples) < 0.008;
    if(quiet && silenceStart < 0) silenceStart = offset;
    if((!quiet || offset+2*frameBytes > pcm.length) && silenceStart >= 0){const end=quiet?offset+frameBytes:offset;if((end-silenceStart)/32>=300)best=Math.floor((silenceStart+end)/4)*2;silenceStart=-1;}
  }
  return best > 0 ? pcm.subarray(0,best) : pcm;
}
const normalized = (text: string) => [...text].filter(c=>/[\p{L}\p{N}]/u.test(c)).join("").toLowerCase();
function trimRepeatedPrefix(text: string, tail: string) {
  const next=normalized(text), previous=normalized(tail).slice(-160);
  let count=0;
  for(let n=Math.min(previous.length,next.length);n>=2;n--){const prefix=next.slice(0,n);if(previous.endsWith(prefix) && (/[\p{Script=Han}]/u.test(prefix) || n>=4)){count=n;break;}}
  if(!count)return text;
  let at=0,found=0;for(const c of text){at+=c.length;if(/[\p{L}\p{N}]/u.test(c))found++;if(found===count)break;}
  return text.slice(at).replace(/^[\s\p{P}]+/u,"");
}
export function mergeReplayCues(chunks: { startMs: number; audioStartMs: number; cues: RecordingCue[] }[]) {
  const merged: RecordingCue[]=[];
  for(const chunk of [...chunks].sort((a,b)=>a.startMs-b.startMs)){
    for(const cue of chunk.cues){
      let incoming={...cue,startMs:cue.startMs+chunk.audioStartMs,endMs:cue.endMs+chunk.audioStartMs};
      if(chunk.audioStartMs<chunk.startMs && incoming.startMs<chunk.startMs){
        const previous=merged.filter(c=>c.endMs>incoming.startMs && c.startMs<chunk.startMs).slice(-3);
        const text=trimRepeatedPrefix(incoming.text,previous.map(c=>c.text).join(""));
        if(!text && incoming.endMs <= chunk.startMs+REPLAY_OVERLAP_MS)continue;
        if(!text)incoming={...incoming,startMs:Math.max(incoming.startMs,chunk.startMs)};
        if(text && text!==incoming.text)incoming={...incoming,text,startMs:Math.min(incoming.endMs-1,Math.max(incoming.startMs,chunk.startMs))};
      }
      if(incoming.endMs>incoming.startMs)merged.push(incoming);
    }
  }
  return merged.sort((a,b)=>a.startMs-b.startMs);
}
