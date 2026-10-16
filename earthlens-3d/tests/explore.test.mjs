import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
test('Explore overlay imports and initializes without removing working renderer',async()=>{
 const app=await read('app.js');
 assert.match(app,/import \{initExploreLayers,updateExploreMap,showExploreAt\}/);
 assert.match(app,/initExploreLayers\(\{map:app\.map,maplibre:maplibregl\}\)/);
 assert.match(app,/updateExploreMap\(\{map:app\.map,fallback:true,leaflet:raster,L\}\)/);
 assert.match(app,/maplibregl\.setWorkerUrl/);
});
test('Public map enrichments declare six thematic layers and 3D tree extrusions',async()=>{
 const src=await read('explore-layers.js');
 for(const theme of ['addresses','trees','cameras','transport','traffic','realty'])assert.match(src,new RegExp("id:'"+theme+"'"));
 assert.match(src,/fill-extrusion-height/);
 assert.match(src,/canopyPolygon/);
 assert.match(src,/earthlens-3d-tree-canopies/);
 assert.match(src,/openstreetcam|Fintraffic|digitraffic/i);
 assert.match(src,/World_Imagery\/MapServer/);
 assert.match(src,/new URLSearchParams\(\{data:query\}\)/);
 assert.match(src,/feature.properties|f.properties/);
});
test('Ten distinct photo adapters and license/proximity safeguards',async()=>{
 const src=await read('photo-sources.js');
 const providers=[...src.matchAll(/\{id:'([^']+)',name:/g)].map(x=>x[1]);
 assert.equal(providers.length,10);
 assert.equal(new Set(providers).size,10);
 assert.match(src,/signal:ctl.signal|signal:AbortSignal\.timeout|AbortSignal\.any/);
 assert.match(src,/nearbyLabel/);
 assert.match(src,/origin:'\*'/);
});
test('Property sites are linked as external search, not scraped inventory',async()=>{
 const src=await read('explore-layers.js');
 for(const key of ['airbnb','booking','google','yandex'])assert.match(src,new RegExp("id:'"+key+"'"));
 assert.match(src,/external-search-only/);
 assert.doesNotMatch(src,/api\.airbnb\.com|booking\.com\/api/);
});
