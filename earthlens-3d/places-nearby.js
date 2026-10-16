// Discover the nearest ACTUAL mapped POI for clicked locations. Do not
// claim a photo belongs to a building unless it matches the selected feature.
import {loadGeoAddonVisual} from './geo-addons-visual.js';
export async function nearestMappedFeature({lat,lon,zoom,features=[],radiusMeters,loader=loadGeoAddonVisual}){
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)return null;
 const metres=Number.isFinite(radiusMeters)?Math.max(5,Math.min(200,radiusMeters)):zoom>=17?45:zoom>=15?80:110;
 const latDelta=metres/111320,lonDelta=latDelta/Math.max(.15,Math.cos(lat*Math.PI/180));
 const local=features.filter(f=>{
  const c=f.geometry?.coordinates,p=f.properties||{};
  return f.geometry?.type==='Point'&&Array.isArray(c)&&
   ['addresses','trees','transport','traffic','realty'].includes(p._kind)&&
   Math.abs(c[1]-lat)<=latDelta&&Math.abs(c[0]-lon)<=lonDelta;
 }).slice(0,450);
 if(!local.length)return null;
 const module=await loader('@turf/nearest-point');
 const nearestPoint=module.nearestPoint||module.default;
 if(typeof nearestPoint!=='function')return null;
 const near=nearestPoint([lon,lat],{type:'FeatureCollection',features:local});
 const index=near?.properties?.featureIndex;
 const distanceKm=near?.properties?.distanceToPoint;
 if(!Number.isInteger(index)||index<0||index>=local.length||!Number.isFinite(distanceKm)||distanceKm*1000>metres)return null;
 return {feature:local[index],distanceMeters:distanceKm*1000};
}
