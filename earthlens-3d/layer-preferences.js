// User-chosen layers and map quality are local preferences, not a user
// account or a data synchronization service. Unknown/old IDs are discarded.
import {readSetting,writeSetting} from './saved-places.js';
export const LAYERS_SETTING='earthlens:active-layers:v1';
export const QUALITY_SETTING='earthlens:quality:v1';
export function restoredLayers(knownIds,defaults,storage){
 const known=new Set(knownIds);
 const raw=readSetting(LAYERS_SETTING,'',storage);
 if(!raw)return defaults.filter(x=>known.has(x));
 try{
  const values=JSON.parse(raw);
  if(!Array.isArray(values)||values.length>64)return defaults.filter(x=>known.has(x));
  return [...new Set(values.filter(x=>typeof x==='string'&&known.has(x)))];
 }catch{return defaults.filter(x=>known.has(x))}
}
export function storeLayers(active,storage){
 const values=[...new Set([...active].filter(x=>typeof x==='string'))];
 return writeSetting(LAYERS_SETTING,JSON.stringify(values),storage);
}
export function restoredQuality(storage){
 const value=readSetting(QUALITY_SETTING,'auto',storage);
 return ['auto','smooth','detail'].includes(value)?value:'auto';
}
export function storeQuality(mode,storage){
 if(!['auto','smooth','detail'].includes(mode))return false;
 return writeSetting(QUALITY_SETTING,mode,storage);
}
