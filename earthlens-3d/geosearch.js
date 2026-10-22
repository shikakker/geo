// A user-initiated, rate-limited place search. Nominatim's public endpoint
// must NOT be used for autocomplete or background query loops.
export const NOMINATIM_URL='https://nominatim.openstreetmap.org/search';
export function suggestedZoom(boundingbox){
 if(!Array.isArray(boundingbox)||boundingbox.length<4)return 15.5;
 const [south,north,west,east]=boundingbox.map(Number);
 if(![south,north,west,east].every(Number.isFinite))return 15.5;
 // A geographic extent may straddle the antimeridian (179.9° -> -179.9°).
 // Treat it as a short crossing, never as a 360-degree-wide country.
 const rawLonSpan=Math.abs(east-west);
 const lonSpan=rawLonSpan<=360?Math.min(rawLonSpan,360-rawLonSpan):360;
 const extent=Math.max(Math.abs(north-south),lonSpan);
 if(extent>=45)return 3;
 if(extent>=8)return 5.5;
 if(extent>=1.5)return 8;
 if(extent>=.35)return 10;
 if(extent>=.08)return 12;
 if(extent>=.012)return 13.7;
 return 16.2;
}
export function normalizeSearchResults(data){
 if(!Array.isArray(data))return [];
 const seen=new Set();
 return data.flatMap(item=>{
  const lat=Number(item.lat),lng=Number(item.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return [];
  const title=String(item.display_name||item.name||'Место на карте').trim().slice(0,220);
  const key=lat.toFixed(5)+':'+lng.toFixed(5);
  if(!title||seen.has(key))return [];
  seen.add(key);
  return [{id:String(item.place_id||key),title,shortName:title.split(',')[0],
   lat,lng,zoom:suggestedZoom(item.boundingbox),
   category:String(item.category||item.class||item.type||'').slice(0,40)}];
 }).slice(0,5);
}
export function createGeocoder({
 fetcher=fetch,clock=Date.now,minIntervalMs=1200,ttlMs=10*60*1000,
 deadlineMs=10000,setTimer=setTimeout,clearTimer=clearTimeout
}={}){
 let lastNetworkAt=-Infinity;
 const memo=new Map();
 const pending=new Set();
 function cancel(){for(const c of pending)c.abort();pending.clear()}
 async function search(text,{signal}={}){
  const q=String(text??'').trim().replace(/\s+/g,' ');
  if(q.length<2||q.length>160)throw Error('Search query length must be between 2 and 160');
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const key=q.toLocaleLowerCase();
  const cached=memo.get(key);
  if(cached&&clock()-cached.at<ttlMs)return cached.results.map(x=>({...x}));
  const gap=clock()-lastNetworkAt;
  if(gap<minIntervalMs){
   const err=new Error('Слишком частые запросы. Повторите поиск через секунду.');
   err.code='RATE_LIMIT_LOCAL';err.retryAfterMs=minIntervalMs-gap;
   throw err;
  }
  lastNetworkAt=clock();
  const controller=new AbortController();
  pending.add(controller);
  // The timeout must apply even without a caller-provided signal. Racing
  // against cancellation also stops a provider that ignores AbortSignal
  // while reading headers or JSON, without waiting for its cleanup.
  let rejectCancelled=()=>{};
  const cancelled=new Promise((_,reject)=>{rejectCancelled=reject});
  const onCancelled=()=>rejectCancelled(new DOMException('Geocoding request cancelled or timed out','AbortError'));
  const onCallerAbort=()=>controller.abort();
  controller.signal.addEventListener('abort',onCancelled,{once:true});
  signal?.addEventListener('abort',onCallerAbort,{once:true});
  const timeoutId=setTimer(()=>controller.abort(),Math.max(1,Math.min(10000,Number(deadlineMs)||10000)));
  if(signal?.aborted)controller.abort();
  try{
   const params=new URLSearchParams({format:'jsonv2',q,limit:'5',addressdetails:'0'});
   const response=await Promise.race([
    fetcher(NOMINATIM_URL+'?'+params,{headers:{Accept:'application/json'},signal:controller.signal}),
    cancelled
   ]);
   if(!response.ok)throw Error('Nominatim HTTP '+response.status);
   const payload=await Promise.race([response.json(),cancelled]);
   if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
   const results=normalizeSearchResults(payload);
   memo.set(key,{at:clock(),results});
   if(memo.size>35)memo.delete(memo.keys().next().value);
   return results.map(x=>({...x}));
  }finally{
   clearTimer(timeoutId);
   signal?.removeEventListener('abort',onCallerAbort);
   controller.signal.removeEventListener('abort',onCancelled);
   pending.delete(controller);
  }
 }
 return {search,cancel,get cachedCount(){return memo.size}};
}
