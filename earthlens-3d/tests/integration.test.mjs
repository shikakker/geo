import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const json=async file=>JSON.parse(await readFile(new URL(file,root),'utf8'));
test('Scene manifest has explicit verifiable real geographic positions',async()=>{
 const {schemaVersion,scenes}=await json('scenes.json');
 assert.equal(schemaVersion,1);
 assert.ok(scenes.length>=1);
 for(const scene of scenes){
  assert.ok(Number.isFinite(scene.longitude)&&Math.abs(scene.longitude)<=180);
  assert.ok(Number.isFinite(scene.latitude)&&Math.abs(scene.latitude)<=85);
  assert.ok(scene.activationZoom>0&&scene.activationZoom<=20);
  assert.ok(scene.activationRadiusMeters>0);
  assert.match(scene.url,/^https:\/\//);
  assert.ok(['khr-3dtiles','raw-splat'].includes(scene.type));
 }
 const sample=scenes.find(scene=>scene.id==='wilhelmina-khr');
 assert.ok(sample);
 assert.equal(sample.type,'khr-3dtiles');
 assert.ok(Math.abs(sample.longitude-5.139727)<0.000001);
 assert.ok(Math.abs(sample.latitude-52.087424)<0.000001);
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
 assert.match(js,/!maplibregl\.supported\(\)/);
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
