import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {preserveEarthLensOverlays} from '../style-transition.js';
const tree={type:'geojson',data:{type:'FeatureCollection',features:[]}};
const images={type:'raster',tiles:['https://example.com/{z}/{x}/{y}.png'],tileSize:256};
const dem={type:'raster-dem',tiles:['https://example.com/dem/{z}/{x}/{y}.png']};

test('Basemap style switches preserve existing local data overlays but not stale basemap layers',()=>{
 const old={version:8,sources:{main:{type:'vector',url:'https://old.example/planet'},'earthlens-tree-volumes':tree,'earthlens-world-imagery':images,'earthlens-elevation':dem},layers:[
  {id:'old-land',source:'main',type:'fill'},
  {id:'earthlens-3d-buildings',source:'main','source-layer':'building',type:'fill-extrusion'},
  {id:'earthlens-3d-tree-canopies',source:'earthlens-tree-volumes',type:'fill-extrusion'},
  {id:'earthlens-imagery-satellite',source:'earthlens-world-imagery',type:'raster'},
  {id:'third-party-layer',source:'main',type:'fill'}
 ],terrain:{source:'earthlens-elevation',exaggeration:1.1}};
 const next={version:8,sources:{main:{type:'vector',url:'https://new.example/planet'}},layers:[
  {id:'new-land',source:'main',type:'fill'},
  {id:'new-labels',source:'main',type:'symbol'}
 ]};
 const result=preserveEarthLensOverlays(old,next);
 assert.deepEqual(result.sources['earthlens-tree-volumes'],tree);
 assert.deepEqual(result.sources['earthlens-world-imagery'],images);
 assert.deepEqual(result.terrain,old.terrain);
 assert.ok(result.layers.some(x=>x.id==='earthlens-3d-tree-canopies'));
 assert.ok(result.layers.some(x=>x.id==='earthlens-imagery-satellite'));
 assert.ok(!result.layers.some(x=>x.id==='earthlens-3d-buildings'), 'old incompatible building source must not be retained');
 assert.ok(!result.layers.some(x=>x.id==='third-party-layer'));
 assert.ok(result.layers.findIndex(x=>x.id==='earthlens-3d-tree-canopies')<result.layers.findIndex(x=>x.id==='new-labels'),'basemap labels should remain on top');
 assert.ok(result.layers.findIndex(x=>x.id==='earthlens-imagery-satellite')<result.layers.findIndex(x=>x.id==='earthlens-3d-tree-canopies'),'satellite imagery must not cover 3D canopy volumes');
 assert.equal(next.layers.length,2,'style transform must not mutate provider specification');
});
test('Matching OSM sources retain extrusion layer without duplicates',()=>{
 const source={type:'vector',url:'https://tiles.openfreemap.org/planet'};
 const prior={sources:{main:source},layers:[{id:'earthlens-3d-buildings',source:'main','source-layer':'building',type:'fill-extrusion'}]};
 const replacement={sources:{main:source},layers:[{id:'new-base',type:'background'}]};
 const transformed=preserveEarthLensOverlays(prior,replacement);
 assert.equal(transformed.layers.filter(x=>x.id==='earthlens-3d-buildings').length,1);
 const two=preserveEarthLensOverlays({...prior,layers:[...prior.layers,{id:'earthlens-3d-buildings',source:'main',type:'fill-extrusion'}]},transformed);
 assert.equal(two.layers.filter(x=>x.id==='earthlens-3d-buildings').length,1);
 assert.equal(preserveEarthLensOverlays(undefined,replacement),replacement);
});
test('Switching styles uses incremental diff and preserves runtime layers',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/setStyle\(next\.url,\{diff:true,transformStyle:preserveEarthLensOverlays\}\)/);
 assert.match(app,/import \{preserveEarthLensOverlays\} from '\.\/style-transition\.js'/);
});
