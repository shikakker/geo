// EarthLens local-only saved locations. No account or analytics are required.
// Storage access can fail in Safari private mode, sandboxed browsers or strict
// cookie settings; the in-memory fallback must keep map navigation usable.
export const SAVED_PLACES_KEY='earthlens:saved-places:v1';
const LIMIT=30;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
// Nominatim and imported map data may contain null/blank coordinates.
// Number(null), Number('') and Number([]) would otherwise fabricate (0, 0).
function parseCoordinate(value){
 if(typeof value==='number')return value;
 if(typeof value!=='string'||!value.trim())return NaN;
 const text=value.trim();
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))return NaN;
 return Number(text);
}

export function safeLocalStorage(){
 try{return typeof window==='undefined'?null:window.localStorage}catch{return null}
}
export function readSetting(key,fallback='',storage=safeLocalStorage()){
 try{return storage?.getItem(key)??fallback}catch{return fallback}
}
export function writeSetting(key,value,storage=safeLocalStorage()){
 try{storage?.setItem(key,String(value));return Boolean(storage)}catch{return false}
}
export function normalizeSavedView(view,now=Date.now()){
 if(!view||typeof view!=='object')return null;
 const center=view.center??null;
 const lat=parseCoordinate(view.lat??center?.lat??(Array.isArray(center)?center[1]:undefined));
 const lng=parseCoordinate(view.lng??center?.lng??(Array.isArray(center)?center[0]:undefined));
 const zoom=Number(view.zoom??16),bearing=Number(view.bearing??0),pitch=Number(view.pitch??0);
 if(![lat,lng,zoom,bearing,pitch].every(Number.isFinite)||Math.abs(lat)>85||Math.abs(lng)>180)return null;
 const clean=s=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80);
 const title=clean(view.title)||'Место · '+lat.toFixed(4)+'°, '+lng.toFixed(4)+'°';
 const id=lat.toFixed(4)+':'+lng.toFixed(4);
 return {
  id,title,lat:Number(lat.toFixed(5)),lng:Number(lng.toFixed(5)),
  zoom:Number(clamp(zoom,2,20).toFixed(2)),
  bearing:Number((((bearing+180)%360+360)%360-180).toFixed(1)),
  pitch:Number(clamp(pitch,0,85).toFixed(1)),
  savedAt:Number.isFinite(now)&&now>=0?Math.round(now):Date.now()
 };
}
export function createSavedPlaces({storage=safeLocalStorage(),now=Date.now,limit=LIMIT}={}){
 const max=Math.max(1,Math.min(100,Math.floor(limit)||LIMIT));
 let stored=false;let places=[];
 try{
  const raw=storage?.getItem(SAVED_PLACES_KEY);
  stored=Boolean(storage);
  if(raw){
   const parsed=JSON.parse(raw);
   if(Array.isArray(parsed)){
    const seen=new Set();
    for(const item of parsed){
     const normalized=normalizeSavedView(item,item?.savedAt);
     if(normalized&&!seen.has(normalized.id)){
      seen.add(normalized.id);places.push(normalized);
     }
     if(places.length>=max)break;
    }
   }
  }
 }catch{stored=false;places=[]}
 const listeners=new Set();
 function emit(){for(const listener of listeners)listener(list())}
 function persist(){
  try{
   if(!storage)return false;
   storage.setItem(SAVED_PLACES_KEY,JSON.stringify(places));
   stored=true;return true;
  }catch{stored=false;return false}
 }
 function list(){return places.map(x=>({...x}))}
 function save(view){
  const value=normalizeSavedView(view,now());
  if(!value)return null;
  places=[value,...places.filter(item=>item.id!==value.id)].slice(0,max);
  persist();emit();return {...value};
 }
 function remove(id){
  const size=places.length;places=places.filter(x=>x.id!==id);
  if(places.length===size)return false;
  persist();emit();return true;
 }
 function clear(){
  if(!places.length)return false;
  places=[];persist();emit();return true;
 }
 function subscribe(listener){
  if(typeof listener!=='function')return ()=>{};
  listeners.add(listener);return ()=>listeners.delete(listener);
 }
 return {list,save,remove,clear,subscribe,get persistent(){return stored},get count(){return places.length}};
}
