// No heavy dependency at initial page load. Both open-source engines are loaded
// only when geographic POI overlays are needed.
import {loadGeoAddonNext} from './geo-addons-next.js';
import {inViewport} from './layer-runtime.js';
let rulerCtor=null,indexCtor=null,loading=null;
const memo=new WeakMap();
export async function warmSpatialAcceleration(){
 if(loading)return loading;
 loading=Promise.allSettled([loadGeoAddonNext('cheap-ruler'),loadGeoAddonNext('kdbush')]).then(([ruler,index])=>{
  if(ruler.status==='fulfilled')rulerCtor=ruler.value.default||ruler.value.CheapRuler;
  if(index.status==='fulfilled')indexCtor=index.value.default||index.value.KDBush;
  return {ruler:!!rulerCtor,index:!!indexCtor};
 });
 return loading;
}
function bounds(center,zoom){
 const longitude=40/Math.pow(2,Math.max(0,zoom-6));
 const latitude=22/Math.pow(2,Math.max(0,zoom-6));
 const dx=Math.max(.002,longitude/Math.max(.2,Math.cos(center.lat*Math.PI/180)));
 const dy=Math.max(.002,latitude);
 return [center.lng-dx,center.lat-dy,center.lng+dx,center.lat+dy];
}
function spatialIndex(features){
 if(!indexCtor||features.length<40)return null;
 let cached=memo.get(features);
 if(cached)return cached;
 const index=new indexCtor(features.length);
 for(const item of features){const coords=item.geometry?.coordinates||[];index.add(coords[0],coords[1])}
 index.finish();
 memo.set(features,index);
 return index;
}
export function visibleByDistance(features,center,zoom,limit){
 if(!Array.isArray(features)||!center)return [];
 const index=spatialIndex(features);
 const box=bounds(center,zoom);
 // Split boxes crossing the antimeridian, otherwise fall back to safe scanning.
 const candidates=index&&box[0]>=-180&&box[2]<=180
  ?index.range(...box).map(i=>features[i])
  :features;
 const latitudeFactor=Math.max(.2,Math.cos(center.lat*Math.PI/180));
 let ruler=null;
 if(rulerCtor)try{ruler=new rulerCtor(center.lat,'meters')}catch{}
 const distance=f=>{
  const [lon,lat]=f.geometry.coordinates;
  if(ruler)return ruler.distance([center.lng,center.lat],[lon,lat]);
  const dx=(((lon-center.lng+540)%360)-180)*latitudeFactor,dy=lat-center.lat;
  return dx*dx+dy*dy;
 };
 return candidates.filter(f=>inViewport(f,center,zoom)).sort((a,b)=>distance(a)-distance(b)).slice(0,limit);
}
export function spatialCapabilities(){return {ruler:!!rulerCtor,index:!!indexCtor}}


// Preserve the SAME input array identity across camera movements. KDBush's
// WeakMap is keyed by that identity; allocating/filtering a new array on every
// draw would rebuild the entire spatial index every time a user pans.
export function createCandidateCache(){
 let previous=null;
 let rebuilds=0;
 function get({osm=[],cameras=[],weather=[],active=new Set(),zoom=0}={}){
  const visiblePOI=zoom>=13;
  const enabled=[...active].sort().join(',');
  if(previous&&previous.osm===osm&&previous.cameras===cameras&&
     previous.weather===weather&&previous.enabled===enabled&&
     previous.visiblePOI===visiblePOI)return previous.features;
  const features=[];
  for(const source of [osm,cameras,weather]){
   for(const item of source){
    const kind=item?.properties?._kind;
    if(kind&&active.has(kind)&&(visiblePOI||kind==='weather'))features.push(item);
   }
  }
  previous={osm,cameras,weather,enabled,visiblePOI,features};
  rebuilds++;
  return features;
 }
 return {get,reset(){previous=null},get rebuilds(){return rebuilds}};
}
