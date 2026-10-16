import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GEO_ADDONS_NEXT,loadGeoAddonNext,activeGeoAddonsNext} from '../geo-addons-next.js';
import {GEO_ADDONS} from '../geo-addons.js';
import {createFrameQueue} from '../progressive-render.js';
import {warmSpatialAcceleration,visibleByDistance,spatialCapabilities} from '../spatial-acceleration.js';
import {WEATHER_HORIZONS,forecastAt,weatherFeatures,weatherRequest,getWeatherForView,resetWeatherCache} from '../weather-layer.js';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Second expansion adds exactly ten DIFFERENT lazily loaded OSS libraries',async()=>{
 const pkg=JSON.parse(await read('package.json'));
 assert.equal(GEO_ADDONS_NEXT.length,10);
 assert.equal(new Set(GEO_ADDONS_NEXT.map(item=>item.id)).size,10);
 assert.equal(new Set([...GEO_ADDONS,...GEO_ADDONS_NEXT].map(item=>item.id)).size,20);
 assert.equal(activeGeoAddonsNext().length,0,'No new package should load on startup');
 for(const lib of GEO_ADDONS_NEXT){
   assert.equal(pkg.dependencies[lib.id],lib.version);
   assert.match(lib.url,/^https:\/\/github\.com\//);
   assert.ok(['MIT','ISC','BSD-2-Clause'].includes(lib.license));
   assert.equal(typeof lib.load,'function');
 }
 assert.ok(Number(pkg.version.split('.')[0])>=1||Number(pkg.version.split('.')[1])>=6,'GIS expansion requires v0.6 or newer');
});

test('Frame-limited rendering spreads 13 objects across multiple frames',()=>{
 const frames=[],canceled=new Set(),visited=[],total=13,done=[];
 const q=createFrameQueue({requestFrame:cb=>{frames.push(cb);return frames.length;},
 cancelFrame:handle=>canceled.add(handle),clock:()=>0});
 q.submit(Array.from({length:total},(_,i)=>i),item=>visited.push(item),()=>done.push(true),{batch:4});
 assert.equal(visited.length,0,'Initial frame never blocks the event loop');
 while(frames.length){const cb=frames.shift();cb()}
 assert.deepEqual(visited,Array.from({length:total},(_,i)=>i));
 assert.equal(done.length,1);
 const first=[];
 q.submit([1,2,3,4,5],x=>first.push(x),()=>done.push('stale'),{batch:2});
 q.submit([9],x=>first.push(x),()=>done.push('new'),{batch:2});
 while(frames.length){const cb=frames.shift();cb()}
 assert.deepEqual(first,[9],'Canceled batches never insert out-of-date markers');
 assert.equal(done.at(-1),'new');
});

test('Spatial indexing and accurate distances are really loaded on demand',async()=>{
 const result=await warmSpatialAcceleration();
 assert.equal(result.ruler,true);
 assert.equal(result.index,true);
 assert.deepEqual(spatialCapabilities(),result);
 assert.deepEqual(activeGeoAddonsNext().sort(),['cheap-ruler','kdbush']);
 const center={lng:4.9,lat:52.37},points=[];
 for(let i=0;i<150;i++)points.push({id:i,properties:{_kind:'trees'},geometry:{type:'Point',coordinates:[4.9+(i-75)*.0002,52.37]}});
 const closest=visibleByDistance(points,center,16,7);
 assert.equal(closest.length,7);
 assert.equal(closest[0].id,75);
 assert.ok(closest.every(p=>Math.abs(p.geometry.coordinates[0]-4.9)<.001));
});

test('Hourly forecast uses actual provider hours, not fabricated weather values',async()=>{
 assert.deepEqual(WEATHER_HORIZONS,[0,3,6,12]);
 const times=['2026-10-16T12:00','2026-10-16T15:00','2026-10-16T18:00','2026-10-17T00:00'];
 const hourly={time:times,temperature_2m:[17.4,21.6,16.3,10.2],weather_code:[1,2,61,3],wind_speed_10m:[10,13,8,5]};
 const raw={current:{time:times[0],temperature_2m:17.4,weather_code:1,wind_speed_10m:10},hourly};
 assert.equal(forecastAt(raw,3).temperature_2m,21.6);
 assert.equal(forecastAt(raw,6).weather_code,61);
 assert.equal(forecastAt(raw,12).temperature_2m,10.2);
 assert.equal(forecastAt({current:raw.current},3),null);
 const loc=[{lat:52.37,lon:4.9}];
 assert.equal(weatherFeatures(loc,raw,3)[0].properties.horizonHours,3);
 assert.equal(weatherFeatures(loc,raw,3)[0].properties.temperature,21.6);
 assert.equal(weatherFeatures(loc,{current:raw.current},3).length,0);
 assert.match(weatherRequest(loc),/hourly=/);
 resetWeatherCache();
 let requests=0;
 const fetcher=async()=>{requests++;return{ok:true,json:async()=>raw}};
 const center={lat:52.37,lng:4.9};
 const now=await getWeatherForView({center,zoom:16,offsetHours:0,fetcher});
 const after=await getWeatherForView({center,zoom:16,offsetHours:3,fetcher});
 assert.equal(requests,1,'Forecast buttons reuse cached weather API response');
 assert.equal(now[0].properties.temperature,17.4);
 assert.equal(after[0].properties.temperature,21.6);
 await assert.rejects(getWeatherForView({center,zoom:16,offsetHours:999,fetcher}),/Unsupported/);
});

test('UI exposes weather time buttons, batch rendering and nonblocking map tile indicator',async()=>{
 const [js,app,css]=await Promise.all([read('explore-layers.js'),read('app.js'),read('styles.css')]);
 assert.match(js,/state\.frameQueue\.submit\(target/);
 assert.match(js,/visibleByDistance\(eligible,center,zoom,limit\)/);
 assert.match(js,/warmSpatialAcceleration\(\)/);
 assert.match(js,/data-weather-hour/);
 assert.match(js,/GEO_ADDONS_NEXT/);
 assert.match(app,/watchMapTiles\(map,app\.stream\)/);
 assert.match(app,/createMapProgress/);
 assert.match(css,/earthlens-stream-status/);
 assert.match(css,/explore-weather-hours/);
 assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(await read('map-progress.js'),/map\.remove\(\)/);
});
