import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const json=async file=>JSON.parse(await readFile(new URL(file,root),'utf8'));
test('Scene manifest has explicit verifiable real geographic positions',async()=>{
 const {schemaVersion,scenes}=await json('scenes.json');
 assert.equal(schemaVersion,3);
 assert.ok(scenes.length>=4);
 for(const scene of scenes){
  assert.ok(Number.isFinite(scene.longitude)&&Math.abs(scene.longitude)<=180);
  assert.ok(Number.isFinite(scene.latitude)&&Math.abs(scene.latitude)<=85);
  assert.ok(scene.activationZoom>0&&scene.activationZoom<=20);
  assert.ok(scene.activationRadiusMeters>0);
  assert.ok(['khr-3dtiles','raw-splat','cesium-ion-khr','3dtiles-model','3dtiles-region'].includes(scene.type));
  if(scene.type==='cesium-ion-khr')assert.ok(Number.isInteger(scene.assetId));
  else assert.match(scene.url,/^https:\/\//);
 }
 const sample=scenes.find(scene=>scene.id==='wilhelmina-khr');
 assert.ok(sample);
 assert.equal(sample.type,'khr-3dtiles');
 assert.ok(Math.abs(sample.longitude-5.139727)<0.000001);
 assert.ok(Math.abs(sample.latitude-52.087424)<0.000001);
 const redmond=scenes.find(scene=>scene.id==='redmond-campus-khr');
 assert.ok(redmond);
 assert.equal(redmond.assetId,4547222);
 assert.equal(redmond.enabled,false,'401 source must not be presented as working');
 assert.ok(Math.abs(redmond.latitude-47.644605)<0.000001);
});
test('Ten public OSS components documented with honest integration status',async()=>{
 const {libraries}=await json('open-source-stack.json');
 assert.equal(libraries.length,10);
 assert.equal(new Set(libraries.map(lib=>lib.name)).size,10);
 for(const lib of libraries){assert.match(lib.url,/^https:\/\/github\.com\//);assert.ok(lib.status&&lib.license)}
});
test('User experience has no uploading controls; 3D scenes are automatic',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 const js=await readFile(new URL('app.js',root),'utf8');
 assert.doesNotMatch(html,/<input[^>]*type=["']file/i);
 assert.doesNotMatch(html,/splat-url|upload-splat/i);
 assert.match(js,/locateNearestScene/);
 assert.match(js,/enterScene\(chosen\)/);
 assert.match(js,/Cesium3DTileset\.fromUrl/);
 assert.match(js,/GaussianSplatControl/);
 assert.match(js,/s.enabled!==false/);
 assert.doesNotMatch(html,/data-scene="redmond-campus-khr"/);
 assert.match(js,/maplibre-gl/);
});
test('Static HTML references existing CSS and JavaScript',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 assert.match(html,/href="\.\/styles\.css"/);
 assert.match(html,/src="\.\/app\.js"/);
});

test('Primary map is bundled with correct MapLibre 6 worker setup',async()=>{
 const js=await readFile(new URL('app.js',root),'utf8');
 const pkg=await json('package.json');
 assert.equal(pkg.dependencies['maplibre-gl'],'6.14.0');
 assert.equal(pkg.dependencies['leaflet'],'1.9.4');
 assert.equal(pkg.devDependencies.vite,'7.1.9');
 assert.match(js,/import \* as maplibregl from 'maplibre-gl'/);
 assert.match(js,/maplibre-gl-worker\.mjs\?worker&url/);
 assert.match(js,/maplibregl\.setWorkerUrl\(maplibreWorkerUrl\)/);
 assert.doesNotMatch(js,/import maplibregl from 'https:\/\/esm\.sh/);
});
test('Rendering recovers automatically from WebGL and provider failures',async()=>{
 const js=await readFile(new URL('app.js',root),'utf8');
 assert.match(js,/activateRasterFallback/);
 assert.match(js,/!supportsWebGL2\(\)/);
 assert.match(js,/function supportsWebGL2\(\)/);
 assert.doesNotMatch(js,/maplibregl\.supported\(\)/);
 assert.match(js,/Map style did not become ready within 12 seconds/);
 assert.match(js,/import\('leaflet'\)/);
 assert.match(js,/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
 const baseStyles=js.match(/https:\/\/tiles\.openfreemap\.org\/styles\/(?:liberty|bright|positron|fiord|dark)/g)||[];
 assert.equal(baseStyles.length,5);
 assert.match(js,/const tiles=L\.tileLayer/);
});
test('No external MapLibre CSS or JavaScript CDN is necessary',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 assert.doesNotMatch(html,/unpkg\.com\/maplibre-gl/);
 assert.doesNotMatch(html,/esm\.sh\/maplibre-gl/);
 assert.match(html,/id="loading-text"/);
 assert.match(html,/id="style-cycle"/);
});

test('3D camera starts over high-rise Manhattan, not in a generic flat demo area',async()=>{
 const js=await readFile(new URL('app.js',root),'utf8');
 assert.match(js,/center: \[-73\.9853, 40\.7487\]/);
 assert.match(js,/pitch: 67/);
 assert.match(js,/earthlens-3d-buildings/);
 assert.match(js,/https:\/\/tiles\.openfreemap\.org\/planet/);
 assert.match(js,/source-layer':'building'/);
 assert.match(js,/updateProjection/);
 assert.match(js,/type:globe\?'globe':'mercator'/);
});
test('Non-WebGL devices still show real OSM building volumes decoded from OpenFreeMap tiles',async()=>{
 const js=await readFile(new URL('app.js',root),'utf8');
 const canvas=await readFile(new URL('fallback-3d.js',root),'utf8');
 const pkg=await json('package.json');
 assert.equal(pkg.dependencies['@mapbox/vector-tile'],'2.0.5');
 assert.equal(pkg.dependencies['pbf'],'4.0.1');
 assert.match(js,/attachCanvasBuildingLayer/);
 assert.match(canvas,/new VectorTile\(new Pbf\(bytes\)\)/);
 assert.match(canvas,/tiles\.openfreemap\.org\/planet\/latest/);
 assert.match(canvas,/ctx\.lineTo\(b\[0\],b\[1\]-lift\)/);
 assert.match(canvas,/tileCache\.size>40/);
});
test('Automatic close-up transitions point to genuine KHR 3D Tiles scenes',async()=>{
 const scenes=(await json('scenes.json')).scenes;
 assert.ok(scenes.some(s=>s.type==='khr-3dtiles'));
 assert.ok(scenes.some(s=>s.type==='cesium-ion-khr'));
 assert.ok(scenes.some(s=>s.type==='3dtiles-model'));
 assert.ok(scenes.some(s=>s.type==='3dtiles-region'));
 const js=await readFile(new URL('app.js',root),'utf8');
 assert.match(js,/Cesium3DTileset\.fromIonAssetId\(scene\.assetId\)/);
 assert.match(js,/maximumScreenSpaceError/);
 const html=await readFile(new URL('index.html',root),'utf8');
 assert.match(html,/data-scene="redmond-campus-khr"/);
 assert.match(html,/data-scene="wilhelmina-khr"/);
});

test('PLATEAU Japan LOD2 3D Tiles do not masquerade as Gaussian Splats',async()=>{
 const manifest=await json('scenes.json');
 const tokyo=manifest.scenes.find(scene=>scene.id==='tokyo-chiyoda-plateau');
 const japan=manifest.scenes.find(scene=>scene.id==='japan-plateau-cities');
 assert.ok(tokyo);assert.ok(japan);
 assert.equal(tokyo.type,'3dtiles-model');
 assert.equal(japan.type,'3dtiles-region');
 assert.match(tokyo.url,/plateauview\.mlit\.go\.jp\/datacatalog\/3dtiles\/13101-bldg-lod2-latest/);
 assert.match(japan.url,/plateauview\.mlit\.go\.jp\/datacatalog\/3dtiles\/all-bldg-maxlod2-latest/);
 assert.deepEqual(japan.bounds,[122,24,146,46]);
 const js=await readFile(new URL('app.js',root),'utf8');
 assert.match(js,/scene\.type==='3dtiles-region'/);
 assert.match(js,/3D CITY MODEL/);
 assert.match(js,/PLATEAU 3D CITY/);
 assert.match(js,/failedScenes\.set\(scene\.id/);
 assert.match(js,/app\.sceneCooldownUntil/);
});

test('Cesium scene transition is gated on a real visible 3D tile, never metadata alone',async()=>{
 const js=await readFile(new URL('app.js',root),'utf8');
 const css=await readFile(new URL('styles.css',root),'utf8');
 assert.match(js,/tileset\.tileVisible\.addEventListener/);
 assert.match(js,/No real 3D Tiles content became visible within 27 seconds/);
 assert.match(js,/stage\.classList\.add\('warming'\)/);
 assert.match(css,/\.cesium-stage\.warming/);
 assert.match(js,/sceneVisibleTiles/);
});
