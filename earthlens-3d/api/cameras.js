// Same-origin, read-only catalogue for Finland's weather cameras.
// Browser cannot bypass provider CORS or reuse 10-minute provider metadata
// without costly repeated requests; this server uses short, bounded caching.
import {fetchCameras} from '../camera-source.js';
import {createSingleFlight} from '../single-flight.js';
const CACHE_MS=10*60*1000,STALE_MS=60*60*1000;
let cache=null;
const requests=createSingleFlight();
export function resetCameraCache(){cache=null;requests.clear()}
function send(res,status,data){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control',status===200?'public, s-maxage=600, stale-while-revalidate=1200':'no-store');
 res.end(JSON.stringify(data));
}
export default async function handler(req,res){
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  send(res,405,{error:'Only GET is allowed'});return;
 }
 const now=Date.now();
 if(cache&&now-cache.time<CACHE_MS){send(res,200,cache.data);return}
 try{
  const data=await requests.run('finland',async()=>{
   if(cache&&Date.now()-cache.time<CACHE_MS)return cache.data;
   const cameras=await fetchCameras();
   const result={features:cameras,source:'Fintraffic Digitraffic',country:'Finland',stale:false,
    updatedAt:new Date().toISOString()};
   cache={time:Date.now(),data:result};
   return result;
  });
  send(res,200,data);
 }catch(error){
  console.warn('Fintraffic cameras unavailable:',String(error?.message||error).slice(0,160));
  if(cache&&now-cache.time<STALE_MS){
   send(res,200,{...cache.data,stale:true});
  }else send(res,503,{error:'Fintraffic cameras unavailable',features:[]});
 }
}
