// Third pack: TEN *additional*, individually importable open-source GIS packages.
// Dependencies live on the client's own bundle, without a paid SDK or hosted API quotas.
// Shared Overpass, Open-Meteo and imagery providers still impose their own limits.
export const GEO_ADDONS_VISUAL=Object.freeze([
 {id:'geojson-vt',name:'GeoJSON-VT',version:'5.0.2',license:'ISC',purpose:'Tile very large vector datasets',url:'https://github.com/mapbox/geojson-vt',load:()=>import('geojson-vt')},
 {id:'vt-pbf',name:'VT-PBF',version:'3.1.3',license:'MIT',purpose:'Compact binary vector tiles',url:'https://github.com/mapbox/vt-pbf',load:()=>import('vt-pbf')},
 {id:'martinez-polygon-clipping',name:'Martinez',version:'0.8.1',license:'MIT',purpose:'Cut and combine urban polygons',url:'https://github.com/w8r/martinez',load:()=>import('martinez-polygon-clipping')},
 {id:'earcut',name:'Earcut',version:'3.2.4',license:'ISC',purpose:'Triangulate 3D ground and canopies',url:'https://github.com/mapbox/earcut',load:()=>import('earcut')},
 {id:'geobuf',name:'Geobuf',version:'3.0.2',license:'ISC',purpose:'Compact offline GeoJSON format',url:'https://github.com/mapbox/geobuf',load:()=>import('geobuf')},
 {id:'@turf/destination',name:'Turf Destination',version:'7.4.0',license:'MIT',purpose:'Geodesic weather wind-direction vectors',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/destination')},
 {id:'@turf/nearest-point',name:'Turf Nearest Point',version:'7.4.0',license:'MIT',purpose:'Identify mapped places on map click',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/nearest-point')},
 {id:'@turf/length',name:'Turf Length',version:'7.4.0',license:'MIT',purpose:'Measure walking and transport routes',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/length')},
 {id:'@turf/boolean-intersects',name:'Turf Intersects',version:'7.4.0',license:'MIT',purpose:'Map layer intersection queries',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/boolean-intersects')},
 {id:'@turf/buffer',name:'Turf Buffer',version:'7.4.0',license:'MIT',purpose:'Radius zones for nearby photos and POIs',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/buffer')}
]);
const cache=new Map();
export function loadGeoAddonVisual(id){
 const addon=GEO_ADDONS_VISUAL.find(x=>x.id===id);
 if(!addon)return Promise.reject(new Error('Unknown GIS adapter: '+id));
 if(!cache.has(id)){
  const result=addon.load().catch(err=>{cache.delete(id);throw err});
  cache.set(id,result);
 }
 return cache.get(id);
}
export function activeGeoAddonsVisual(){return [...cache.keys()]}
