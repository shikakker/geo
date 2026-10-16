// Same-origin read-only OSM query proxy for Vercel Vite deployment.
// Prevents browser CORS failures. This is a bounded proxy, not an unlimited API.
import {createSingleFlight} from '../single-flight.js';
const SOURCES=[
 'https://overpass-api.de/api/interpreter',
 'https://overpass.private.coffee/api/interpreter'
];
const KINDS=new Set(['addresses','trees','transport','traffic','realty']);
const cache=new Map();
const inflight=createSingleFlight();
const bounds=(value,min,max)=>Math.min(max,Math.max(min,value));
export function paramsFromUrl(url){
 const search=new URL(url,'https://earthlens-3d.vercel.app').searchParams;
 const lat=Number(search.get('lat')),lon=Number(search.get('lon')),zoom=Number(search.get('zoom'));
 const layers=[...new Set(String(search.get('layers')||'').split(',').filter(x=>KINDS.has(x)))].sort();
 if(search.get('lat')===null||search.get('lon')===null||search.get('zoom')===null
  ||!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(zoom)
  ||Math.abs(lat)>85||Math.abs(lon)>180||zoom<13||zoom>20||!layers.length)return null;
 return {lat:Number(lat.toFixed(3)),lon:Number(lon.toFixed(3)),zoom:bounds(zoom,13,20),layers};
}
export function makeOverpassQuery({lat,lon,zoom,layers}){
 const radius=zoom>=17?380:zoom>=15?700:1400;
 const clauses=[];
 const around=r=>'around:'+r+','+lat+','+lon;
 if(layers.includes('addresses'))clauses.push('nwr["addr:housenumber"]('+around(radius)+');');
 if(layers.includes('trees')){
  clauses.push('nwr["natural"~"^(tree|tree_row|wood)$"]('+around(radius)+');');
  clauses.push('nwr["leisure"="park"]('+around(radius)+');');
 }
 if(layers.includes('transport')){
  clauses.push('nwr["highway"="bus_stop"]('+around(radius)+');');
  clauses.push('nwr["public_transport"="platform"]('+around(radius)+');');
 }
 if(layers.includes('traffic'))clauses.push('node["highway"="traffic_signals"]('+around(radius)+');');
 if(layers.includes('realty'))clauses.push('nwr["building"]('+around(Math.min(radius,450))+');');
 return '[out:json][timeout:14][maxsize:33554432];('+clauses.join('')+');out center 1000;';
}
async function queryUpstream(query,fetcher){
 let last;
 for(const [index,endpoint] of SOURCES.entries()){
  try{
   const response=await fetcher(endpoint,{
    method:'POST',
    headers:{
     'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
     'Accept':'application/json',
     'User-Agent':'EarthLens3D/0.5 (https://earthlens-3d.vercel.app; read-only map geodata)'
    },
    body:new URLSearchParams({data:query}),
    // Remain below a typical serverless request deadline even after fallback.
    signal:AbortSignal.timeout(index===0?4400:3100)
   });
   if(!response.ok)throw Error('Provider status '+response.status);
   const payload=await response.json();
   if(!Array.isArray(payload?.elements))throw Error('Invalid Overpass response');
   return payload.elements.slice(0,1000);
  }catch(error){last=error}
 }
 throw last||Error('OSM data temporarily unavailable');
}
function send(res,status,data){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control',status===200?'public, s-maxage=600, stale-while-revalidate=1800':'no-store');
 res.end(JSON.stringify(data));
}
export default async function handler(req,res){
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');send(res,405,{error:'Method not allowed'});return;
 }
 const params=paramsFromUrl(req.url||'/');
 if(!params){send(res,400,{error:'Invalid map viewport or layers'});return}
 const key=JSON.stringify(params),hit=cache.get(key);
 if(hit&&Date.now()-hit.time<10*60*1000){send(res,200,hit.data);return}
 try{
  const elements=await inflight.run(key,()=>queryUpstream(makeOverpassQuery(params),fetch));
  const result={elements,source:'OpenStreetMap / Overpass',updatedAt:new Date().toISOString()};
  cache.set(key,{time:Date.now(),data:result});
  if(cache.size>60)cache.delete(cache.keys().next().value);
  send(res,200,result);
 }catch(error){
  console.warn('OSM upstream failed:',String(error?.message||error).slice(0,180));
  // When providers are down, a previously fetched nearby map can still be used.
  // The returned stale flag indicates these are not new/realtime observations.
  if(hit&&Date.now()-hit.time<60*60*1000){
   send(res,200,{...hit.data,stale:true});
  }else send(res,503,{error:'OSM objects temporarily unavailable',elements:[]});
 }
}
