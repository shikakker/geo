// Pure, deterministic performance policy for EarthLens overlay density.
// No permanent animation loop; browser FPS samples are collected only during
// camera movement and are discarded when the user stops navigating.
export const QUALITY_PREFERENCES=Object.freeze(['auto','smooth','detail']);
export function initialQuality({width=1024,deviceMemory=8,connection='4g',reducedMotion=false}={}){
 const effectiveType=String(connection||'').toLowerCase();
 const lowMemory=Number.isFinite(deviceMemory)&&deviceMemory>0&&deviceMemory<=4;
 const narrow=Number.isFinite(width)&&width<760;
 return reducedMotion||lowMemory||narrow||/^(?:slow-2g|2g|3g)$/.test(effectiveType)?'smooth':'detail';
}
export function createAdaptiveQuality({environment={},onChange=()=>{},now=Date.now}={}){
 let mode='auto',effective=initialQuality(environment),slowSamples=0,fastSamples=0;
 let changedAt=now(),lastFps=null;
 const maxDetail=initialQuality(environment)==='detail';
 function setEffective(value,reason){
  if(value===effective)return false;
  effective=value;changedAt=now();
  onChange({mode,effective,reason,fps:lastFps});return true;
 }
 function setPreference(next){
  if(!QUALITY_PREFERENCES.includes(next))return false;
  if(mode===next)return false;
  mode=next;slowSamples=0;fastSamples=0;
  const target=next==='auto'?initialQuality(environment):next;
  const updated=setEffective(target,next==='auto'?'device-profile':'manual');
  if(!updated)onChange({mode,effective,reason:'preference',fps:lastFps});
  return true;
 }
 function recordFps(value){
  const fps=Number(value);
  if(!Number.isFinite(fps)||fps<1||fps>240||mode!=='auto')return false;
  lastFps=Math.round(fps);
  if(fps<38){slowSamples++;fastSamples=0}
  else if(fps>55){fastSamples++;slowSamples=0}
  else{slowSamples=0;fastSamples=0}
  if(now()-changedAt<4200)return false;
  if(effective==='detail'&&slowSamples>=2){
   slowSamples=0;return setEffective('smooth','low-fps');
  }
  if(effective==='smooth'&&maxDetail&&fastSamples>=3){
   fastSamples=0;return setEffective('detail','stable-fps');
  }
  return false;
 }
 return {
  setPreference,recordFps,
  get preference(){return mode},
  get effective(){return effective},
  get lastFps(){return lastFps}
 };
}
export function beginMoveFpsSampling(map,controller,{requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}={}){
 if(!map?.on||!map?.off)return ()=>{};
 let frame=null,active=false,previous=null,windowStart=null,count=0;
 const stop=()=>{active=false;if(frame!==null)cancelFrame(frame);frame=null;previous=null;windowStart=null;count=0};
 const tick=timestamp=>{
  if(!active)return;
  frame=null;
  if(windowStart===null)windowStart=timestamp;
  if(previous!==null&&timestamp>previous)count++;
  previous=timestamp;
  const elapsed=timestamp-windowStart;
  if(elapsed>=750){
   controller.recordFps(count*1000/elapsed);
   count=0;windowStart=timestamp;
  }
  if(active)frame=requestFrame(tick);
 };
 const start=()=>{
  if(active||controller.preference!=='auto')return;
  active=true;frame=requestFrame(tick);
 };
 map.on('movestart',start);
 map.on('moveend',stop);
 map.on('remove',stop);
 return ()=>{stop();map.off('movestart',start);map.off('moveend',stop);map.off('remove',stop)};
}
