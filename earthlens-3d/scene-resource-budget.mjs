// Browser-side streaming budget: large PLATEAU regions and Gaussian captures
// must not keep unlimited Cesium geometry and raster textures in memory.
const MiB=1024*1024;
export function budgetForScene(scene){
  const city=scene?.type==='3dtiles-model'||scene?.type==='3dtiles-region';
  return {
    cacheBytes:(city?48:96)*MiB,
    maximumCacheOverflowBytes:(city?32:64)*MiB,
    maximumScreenSpaceError:city?48:Math.max(16,scene?.maximumScreenSpaceError||24),
    maxImageryLevel:city?14:17,
    globeTileCacheSize:city?24:48,
    globeScreenSpaceError:city?12:6,
    resolutionScale:city?0.65:0.8
  };
}
