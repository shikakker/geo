import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GEO_ADDONS} from '../geo-addons.js';
import {GEO_ADDONS_NEXT} from '../geo-addons-next.js';
import {GEO_ADDONS_VISUAL,activeGeoAddonsVisual} from '../geo-addons-visual.js';
import {createWindGeoJSON} from '../weather-wind.js';
import {nearestMappedFeature} from '../places-nearby.js';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Thirty open source modules are distinct, version-pinned and lazy',async()=>{
 const pkg=JSON.parse(await read('package.json'));
 assert.equal(pkg.version,'0.6.0');
 assert.equal(GEO_ADDONS.length,10);
 assert.equal(GEO_ADDONS_NEXT.length,10);
 assert.equal(GEO_ADDONS_VISUAL.length,10);
 const all=[...GEO_ADDONS,...GEO_ADDONS_NEXT,...GEO_ADDONS_VISUAL];
 assert.equal(new Set(all.map(x=>x.id)).size,30);
 assert.equal(activeGeoAddonsVisual().length,0,'No third-pack downloads at map bootstrap');
 for(const item of all){
  const pkgName=({
   distance:'@turf/distance',bbox:'@turf/bbox','point-in-polygon':'@turf/boolean-point-in-polygon',
   easing:'d3-ease',interpolate:'d3-interpolate',array:'d3-array',scale:'d3-scale'
  })[item.id]||item.id;
  assert.equal(pkg.dependencies[pkgName],item.version,'Package must match pinned adapter '+item.id);
  assert.match(item.url,/^https:\/\/github\.com\//);
  assert.ok(['MIT','ISC','BSD-2-Clause','BSD-3-Clause'].includes(item.license));
  assert.equal(typeof item.load,'function');
 }
});
test('Geodesic weather wind vectors have physical direction but illustrative length',async()=>{
 const place={type:'Feature',id:'wx:1',geometry:{type:'Point',coordinates:[4.9,52.37]},
  properties:{wind:18,windDirection:0,_color:'#ddeeff'}};
 const result=await createWindGeoJSON([place]);
 assert.equal(result.features.length,1);
 const vector=result.features[0];
 assert.equal(vector.properties.direction,180,'Wind FROM north must point TO south');
 assert.equal(vector.geometry.coordinates[0][0],4.9);
 assert.ok(vector.geometry.coordinates[1][1]<52.37,'South wind arrow should move south');
 assert.match(vector.properties.description,/illustrative/);
 const unavailable=await createWindGeoJSON([{...place,properties:{wind:null,windDirection:0}}]);
 assert.deepEqual(unavailable.features,[],'No invented wind vector if provider has no speed');
});
test('Clicking a geographic feature selects actual nearest OSM place',async()=>{
 const points=[
  {type:'Feature',id:'n/1',geometry:{type:'Point',coordinates:[4.90016,52.37005]},properties:{_kind:'addresses',name:'Nearby address'}},
  {type:'Feature',id:'n/2',geometry:{type:'Point',coordinates:[4.908,52.377]},properties:{_kind:'transport',name:'Far away stop'}}
 ];
 const result=await nearestMappedFeature({lat:52.37,lon:4.9,zoom:16,features:points});
 assert.equal(result.feature.properties.name,'Nearby address');
 assert.ok(result.distanceMeters<30);
 const none=await nearestMappedFeature({lat:52.3,lon:4.7,zoom:16,features:points});
 assert.equal(none,null,'Never claim a distant location is the selected place');
});
test('Adaptive map quality keeps reduced-motion and attributions',async()=>{
 const app=await read('app.js'),explore=await read('explore-layers.js'),style=await read('styles.css');
 assert.match(app,/pixelRatio:max|pixelRatio,maxTileCacheZoomLevels/);
 assert.match(app,/maxTileCacheZoomLevels:compact\?3:7/);
 assert.match(app,/antialias:!compact/);
 assert.match(explore,/renderWindVectors\(\)/);
 assert.match(explore,/data-render-quality/);
 assert.match(explore,/quality:'smooth'/);
 assert.match(explore,/nearestMappedFeature/);
 assert.match(explore,/30 GIS-библиотек/);
 assert.match(style,/explore-render-quality/);
 assert.match(style,/prefers-reduced-motion/);
 assert.match(style,/explore-wx-arrow/);
});
