// EarthLens expansion pack: another TEN independently usable open-source packages.
// Software can be self-hosted without provider quotas. Map/weather APIs cannot.
export const GEO_ADDONS_NEXT=Object.freeze([
 {id:'cheap-ruler',name:'Cheap Ruler',version:'4.1.0',license:'ISC',purpose:'Precise fast distance ranking',url:'https://github.com/mapbox/cheap-ruler',load:()=>import('cheap-ruler')},
 {id:'kdbush',name:'KDBush',version:'4.1.0',license:'ISC',purpose:'Fast viewport point indexing',url:'https://github.com/mourner/kdbush',load:()=>import('kdbush')},
 {id:'flatbush',name:'Flatbush',version:'4.4.0',license:'ISC',purpose:'Bounding-box spatial queries',url:'https://github.com/mourner/flatbush',load:()=>import('flatbush')},
 {id:'simplify-js',name:'Simplify.js',version:'1.2.4',license:'BSD-2-Clause',purpose:'Simplify dense paths before rendering',url:'https://github.com/mourner/simplify-js',load:()=>import('simplify-js')},
 {id:'polylabel',name:'Polylabel',version:'2.1.0',license:'ISC',purpose:'Place park and district labels inside polygons',url:'https://github.com/mapbox/polylabel',load:()=>import('polylabel')},
 {id:'d3-geo',name:'D3 Geo',version:'3.1.1',license:'ISC',purpose:'GeoJSON projections and sphere operations',url:'https://github.com/d3/d3-geo',load:()=>import('d3-geo')},
 {id:'@turf/area',name:'Turf Area',version:'7.4.0',license:'MIT',purpose:'Geodesic building and park areas',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/area')},
 {id:'@turf/centroid',name:'Turf Centroid',version:'7.4.0',license:'MIT',purpose:'Centre polygons and places',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/centroid')},
 {id:'@turf/bearing',name:'Turf Bearing',version:'7.4.0',license:'MIT',purpose:'Directional arrows and wind bearings',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/bearing')},
 {id:'@turf/along',name:'Turf Along',version:'7.4.0',license:'MIT',purpose:'Points along walking and road routes',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/along')}
]);
const initialized=new Map();
export function loadGeoAddonNext(id){
 const adapter=GEO_ADDONS_NEXT.find(item=>item.id===id);
 if(!adapter)return Promise.reject(new Error('Unknown expansion addon: '+id));
 if(!initialized.has(id)){
  initialized.set(id,adapter.load().catch(error=>{initialized.delete(id);throw error}));
 }
 return initialized.get(id);
}
export function activeGeoAddonsNext(){return [...initialized.keys()]}
