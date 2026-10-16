// Wind directions are derived from REAL Open-Meteo model values.
// Arrow direction is where the wind blows TO; Open-Meteo wind_direction is FROM.
// Display length is illustrative, not an actual wind displacement forecast.
import {loadGeoAddonVisual} from './geo-addons-visual.js';
export async function createWindGeoJSON(features,{loader=loadGeoAddonVisual}={}){
 const valid=(features||[]).filter(f=>{
  const p=f?.properties||{},c=f?.geometry?.coordinates;
  return f?.geometry?.type==='Point'&&Array.isArray(c)&&
   Number.isFinite(c[0])&&Number.isFinite(c[1])&&
   p.windDirection!==null&&Number.isFinite(Number(p.windDirection))&&
   p.wind!==null&&Number.isFinite(Number(p.wind))&&Number(p.wind)>0;
 });
 const empty={type:'FeatureCollection',features:[]};
 if(!valid.length)return empty;
 const module=await loader('@turf/destination');
 const dest=module.destination||module.default;
 if(typeof dest!=='function')throw Error('Destination module does not export a function');
 return {type:'FeatureCollection',features:valid.map(f=>{
  const p=f.properties,origin=f.geometry.coordinates;
  const bearing=(Number(p.windDirection)+180)%360;
  const lengthKm=Math.max(.12,Math.min(.8,Number(p.wind)*.015));
  const end=dest(origin,lengthKm,bearing,{units:'kilometers'}).geometry.coordinates;
  return {type:'Feature',id:'wind:'+String(f.id||origin.join(',')),properties:{
   direction:bearing,windSpeed:Number(p.wind),description:'Model wind vector, illustrative visual length',
   color:p._color||'#9ddbe7'
  },geometry:{type:'LineString',coordinates:[origin,end]}};
 })};
}
