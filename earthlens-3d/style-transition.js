// Preserve EarthLens-owned sources/3D overlays when the basemap style changes.
// MapLibre setStyle({diff:true}) may otherwise tear them down and visibly blink.
// Other providers' sources/layers are never copied or modified.
export function preserveEarthLensOverlays(previous,incoming){
 if(!previous||!incoming||!Array.isArray(incoming.layers))return incoming;
 const oldSources=previous.sources||{};
 const nextSources={...(incoming.sources||{})};
 for(const [id,source] of Object.entries(oldSources)){
  if(id.startsWith('earthlens-')&&!Object.hasOwn(nextSources,id))
   nextSources[id]=source;
 }
 const nextLayers=incoming.layers.slice();
 const existing=new Set(nextLayers.map(layer=>layer.id));
 const preserved=(previous.layers||[]).filter(layer=>{
  if(!layer?.id?.startsWith('earthlens-')||existing.has(layer.id))return false;
  if(layer.source&&!Object.hasOwn(nextSources,layer.source))return false;
  // A building layer linked to the OLD basemap vector source cannot safely
  // be reused when the new style changes its source identity or tile URL.
  if(layer['source-layer']==='building'&&!layer.source.startsWith('earthlens-')){
   const prior=oldSources[layer.source],current=incoming.sources?.[layer.source];
   if(!prior||!current||JSON.stringify(prior)!==JSON.stringify(current))return false;
  }
  return true;
 });
 const insertion=nextLayers.findIndex(layer=>layer.type==='symbol');
 nextLayers.splice(insertion<0?nextLayers.length:insertion,0,...preserved);
 const result={...incoming,sources:nextSources,layers:nextLayers};
 if(!incoming.terrain&&previous.terrain&&nextSources[previous.terrain.source]){
  result.terrain=previous.terrain;
 }
 return result;
}
