// Request-aware, capacity-bounded helpers shared by OSM and weather overlays.
export function featureKey(feature){
 const c=feature.geometry?.coordinates||[];
 const id=feature.id;
 if(id!==undefined&&id!==null)return String(id);
 return String(feature.properties?._kind||'place')+':'+Number(c[0]).toFixed(5)+':'+Number(c[1]).toFixed(5);
}
export function createTTLCache({limit=32,ttlMs=4*60*1000,now=Date.now}={}){
 const entries=new Map();
 return {
  get(key){
   const hit=entries.get(key);
   if(!hit)return undefined;
   if(now()-hit.time>ttlMs){entries.delete(key);return undefined}
   entries.delete(key);entries.set(key,hit);return hit.value;
  },
  set(key,value){
   entries.delete(key);entries.set(key,{value,time:now()});
   while(entries.size>limit)entries.delete(entries.keys().next().value);
  },
  clear(){entries.clear()},
  size(){return entries.size}
 };
}
export function tileKey(center,zoom,layers){
 // Match the OSM API's 0.001° query centre AND its radius thresholds. The
 // previous key rounded to 0.01°, causing objects queried for one block to be
 // shown as if they covered another block hundreds of metres away.
 const radiusTier=zoom>=17?'street':zoom>=15?'city':'district';
 const lat=Number(Number(center.lat).toFixed(3));
 const lon=Number(Number(center.lng).toFixed(3));
 const kinds=[...layers].filter(id=>id!=='weather'&&id!=='cameras').sort().join(',');
 return [radiusTier,lat,lon,kinds].join(':');
}
export function inViewport(feature,center,zoom){
 const [lon,lat]=feature.geometry?.coordinates||[];
 if(!Number.isFinite(lon)||!Number.isFinite(lat))return false;
 // Coarse max-radius prefilter. Camera resources can contain a whole country's data.
 const approximateLongitude=40/Math.pow(2,Math.max(0,zoom-6));
 const approximateLatitude=22/Math.pow(2,Math.max(0,zoom-6));
 const deltaLon=Math.abs(((lon-center.lng+540)%360)-180);
 return Math.abs(lat-center.lat)<Math.max(.002,approximateLatitude)&&deltaLon<Math.max(.002,approximateLongitude/Math.max(.2,Math.cos(center.lat*Math.PI/180)));
}
export function withinMarkers(feature,center,zoom,kind){
 return inViewport(feature,center,kind==='weather'?Math.min(zoom,11):zoom);
}
