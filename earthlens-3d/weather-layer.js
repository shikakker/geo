// Real weather model values; no fabricated values on failed/limited API requests.
// Open-Meteo free tier is non-commercial, quota-limited. Fetch only on demand.
import {loadGeoAddon} from './geo-addons.js';
const API='https://api.open-meteo.com/v1/forecast';
const CURRENT='temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,pressure_msl';
const TTL=15*60*1000;
const cache=new Map();
export function weatherSymbol(code){
 const value=Number(code);
 if(code===null||code===undefined||!Number.isFinite(value))return '◌';
 if(value===0)return '☀';
 if(value<=3)return '⛅';
 if(value<=48)return '≋';
 if(value<=67||value>=80&&value<=82)return '☂';
 if(value<=77||value>=85&&value<=86)return '❄';
 if(value>=95)return 'ϟ';
 return '☁';
}
export function weatherSamples(center,zoom){
 const lat=Number(center?.lat),lon=Number(center?.lng);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)return [];
 const step=zoom>=12?0:zoom>=10?.12:zoom>=8?.4:zoom>=6?1.5:6;
 const base=[Number(lat.toFixed(3)),Number(lon.toFixed(3))];
 const candidates=[[0,0]];
 if(zoom<12)candidates.push([-1,-1],[1,-1],[-1,1],[1,1]);
 return candidates.map(([i,j])=>({
   lat:Math.max(-84,Math.min(84,base[0]+step*i)),
   lon:Math.max(-179,Math.min(179,base[1]+step*j))
 })).filter((p,i,all)=>all.findIndex(x=>x.lat===p.lat&&x.lon===p.lon)===i);
}
export function weatherRequest(samples){
 const p=new URLSearchParams({
  latitude:samples.map(x=>x.lat.toFixed(3)).join(','),
  longitude:samples.map(x=>x.lon.toFixed(3)).join(','),
  current:CURRENT,timezone:'auto',forecast_days:'1'
 });
 return API+'?'+p;
}
export function weatherFeatures(samples,raw){
 const values=Array.isArray(raw)?raw:[raw];
 return samples.flatMap((point,i)=>{
  const info=values[i]?.current||{};
  const temp=Number(info.temperature_2m);
  if(!Number.isFinite(temp))return [];
  const num=value=>value===null||value===undefined||!Number.isFinite(Number(value))?null:Number(value);
  return [{
   type:'Feature',
   id:'weather:'+point.lat.toFixed(3)+':'+point.lon.toFixed(3),
   geometry:{type:'Point',coordinates:[point.lon,point.lat]},
   properties:{
    _kind:'weather',name:'Погода',temperature:temp,
    feels:num(info.apparent_temperature),humidity:num(info.relative_humidity_2m),
    precipitation:num(info.precipitation),clouds:num(info.cloud_cover),
    wind:num(info.wind_speed_10m),windDirection:num(info.wind_direction_10m),
    pressure:num(info.pressure_msl),weatherCode:num(info.weather_code),
    updated:String(info.time||''),symbol:weatherSymbol(info.weather_code),
    source:'Open-Meteo (model forecast)'
   }
  }];
 });
}
export async function getWeatherForView({center,zoom,signal,fetcher=fetch}){
 const samples=weatherSamples(center,zoom);
 if(!samples.length)return [];
 const precision=zoom>=12?2:zoom>=8?1:0;
 const key=[Math.round(zoom>=12?12:zoom>=10?10:zoom>=8?8:6),samples.length,Number(center.lat).toFixed(precision),Number(center.lng).toFixed(precision)].join(':');
 const hit=cache.get(key);
 if(hit&&Date.now()-hit.time<TTL)return weatherFeatures(samples,hit.raw);
 const url=weatherRequest(samples);
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),9500);
 try{
  const response=await fetcher(url,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Weather API HTTP '+response.status);
  const data=await response.json();
  const features=weatherFeatures(samples,data);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  cache.set(key,{time:Date.now(),raw:data});
  if(cache.size>24)cache.delete(cache.keys().next().value);
  return features;
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}
export async function temperatureColor(temp){
 // D3 is used only when the weather overlay is active; rendering has a safe fallback.
 try{
  const {scaleLinear}=await loadGeoAddon('scale');
  return scaleLinear().domain([-22,0,18,38]).range(['#538dc0','#a7cddd','#e8ae63','#bf6159']).clamp(true)(temp);
 }catch{return temp<=0?'#538dc0':temp>=30?'#bf6159':'#e8ae63'}
}
export function resetWeatherCache(){cache.clear()}
