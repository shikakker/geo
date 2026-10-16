// Lightweight, optional npm geospatial adapters. Each loader is an explicit
// Vite dynamic import, split into a separate chunk instead of blocking startup.
// The libraries have no hosted API quotas; external data providers still do.
export const GEO_ADDONS=Object.freeze([
 {id:'supercluster',name:'Supercluster',version:'8.0.1',license:'ISC',purpose:'Cluster large groups of POIs',url:'https://github.com/mapbox/supercluster',load:()=>import('supercluster')},
 {id:'rbush',name:'RBush',version:'4.0.1',license:'MIT',purpose:'Fast spatial indexing',url:'https://github.com/mourner/rbush',load:()=>import('rbush')},
 {id:'distance',name:'Turf distance',version:'7.2.0',license:'MIT',purpose:'Accurate geographic distances',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/distance')},
 {id:'bbox',name:'Turf bbox',version:'7.2.0',license:'MIT',purpose:'Geodata bounds',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/bbox')},
 {id:'point-in-polygon',name:'Turf point in polygon',version:'7.2.0',license:'MIT',purpose:'Geofence / point filtering',url:'https://github.com/Turfjs/turf',load:()=>import('@turf/boolean-point-in-polygon')},
 {id:'easing',name:'D3 ease',version:'3.0.1',license:'BSD-3-Clause',purpose:'Progressive entrances',url:'https://github.com/d3/d3-ease',load:()=>import('d3-ease')},
 {id:'interpolate',name:'D3 interpolate',version:'3.0.1',license:'ISC',purpose:'Smooth property transitions',url:'https://github.com/d3/d3-interpolate',load:()=>import('d3-interpolate')},
 {id:'array',name:'D3 array',version:'3.2.4',license:'ISC',purpose:'Weather aggregates',url:'https://github.com/d3/d3-array',load:()=>import('d3-array')},
 {id:'scale',name:'D3 scale',version:'4.0.2',license:'ISC',purpose:'Weather value visualization',url:'https://github.com/d3/d3-scale',load:()=>import('d3-scale')},
 {id:'proj4',name:'Proj4js',version:'2.13.0',license:'MIT',purpose:'Convert geodetic coordinate systems',url:'https://github.com/proj4js/proj4js',load:()=>import('proj4')}
]);
const cache=new Map();
export function loadGeoAddon(id){
 const addon=GEO_ADDONS.find(x=>x.id===id);
 if(!addon)return Promise.reject(new Error('Unknown geodata adapter: '+id));
 if(!cache.has(id)){
  const pending=addon.load().catch(error=>{cache.delete(id);throw error});
  cache.set(id,pending);
 }
 return cache.get(id);
}
export function activeGeoAddons(){return [...cache.keys()]}
