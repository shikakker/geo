/**
 * Cesium 3D Tiles / KHR Gaussian Splat LOD quality controller.
 * Khronos splats are streamed by Cesium's 3D Tiles traversal. Raising the
 * screen-space error reduces network/GPU cost; lowering it increases fidelity.
 * https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/
 */
export const LOD_PRESETS = Object.freeze({
  auto: "АВТО",
  performance: "БЫСТРО",
  balanced: "БАЛАНС",
  quality: "ДЕТАЛИ",
});
export function isLodMode(value){return Object.hasOwn(LOD_PRESETS,value)}
export function recommendedSSE({width=1280,memory=8,saveData=false}={}){
  // Conservative mobile/low-memory default so Gaussian texture streaming
  // does not allocate desktop-sized payloads on phones.
  return saveData || width<=680 || (Number.isFinite(memory)&&memory<=4) ? 32 : 16;
}
export function lodSSE(mode,device={}){
  if(mode==="performance")return 32;
  if(mode==="balanced")return 16;
  if(mode==="quality")return 8;
  return recommendedSSE(device);
}
export function applyLod(tileset,mode,device={}){
  if(!tileset)throw new TypeError("A loaded 3D Tiles tileset is required");
  const sse=lodSSE(mode,device);
  tileset.maximumScreenSpaceError=sse;
  return sse;
}
export function isSceneEnabled(scene,{publicIonToken=""}={}){
  if(!scene || !scene.id)return false;
  if(scene.enabled!==false)return true;
  return scene.enableWithIonToken===true && typeof publicIonToken==="string" && publicIonToken.length>0;
}
