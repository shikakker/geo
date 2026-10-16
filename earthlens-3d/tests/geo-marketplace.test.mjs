import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GEO_LIBRARY_GROUPS,GEO_LIBRARY_CATALOG,lookupGeoLibrary,filterGeoLibraries} from '../geo-library-catalog.js';
import {GEO_ENABLED_LIBRARIES,loadEnabledGeoLibrary} from '../geo-addon-enabled.js';
import {GEO_ADDONS} from '../geo-addons.js';
import {GEO_ADDONS_NEXT} from '../geo-addons-next.js';
import {GEO_ADDONS_VISUAL} from '../geo-addons-visual.js';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('Exactly 100 ADDITIONAL distinct optional geospatial/3D/weather libraries',async()=>{
 const pkg=JSON.parse(await read('package.json'));
 const count=GEO_LIBRARY_GROUPS.reduce((n,[category,packages])=>n+packages.length,0);
 assert.equal(count,100);
 assert.equal(GEO_LIBRARY_CATALOG.length,100);
 assert.equal(new Set(GEO_LIBRARY_CATALOG.map(x=>x.id)).size,100);
 assert.equal(GEO_LIBRARY_GROUPS.length,9);
 const existing=new Set([...GEO_ADDONS,...GEO_ADDONS_NEXT,...GEO_ADDONS_VISUAL].map(x=>x.id));
 assert.equal(existing.size,30);
 for(const item of GEO_LIBRARY_CATALOG){
  assert.ok(!existing.has(item.id),'Must add new, not repeated, packages: '+item.id);
  assert.ok(!Object.hasOwn(pkg.dependencies,item.package),'Catalog should not secretly install 100 dependencies: '+item.package);
  assert.match(item.info,/^https:\/\/www\.npmjs\.com\/package\//);
  assert.match(item.id,/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/);
  assert.equal(item.status,'available-to-install');
 }
 assert.deepEqual(Object.keys(GEO_ENABLED_LIBRARIES),[]);
 await assert.rejects(loadEnabledGeoLibrary('three'),/not installed/);
 assert.deepEqual(lookupGeoLibrary('h3-js')?.category,'Пространственные индексы');
 assert.equal(filterGeoLibraries('h3-js').length,1);
 assert.equal(filterGeoLibraries('wind').length,0);
 assert.equal(filterGeoLibraries('','Погода, время и координаты').length,8);
});
test('Geo installer only activates explicitly allowlisted, licensed dependencies',async()=>{
 const code=await read('scripts/enable-geolibrary.mjs'),pkg=JSON.parse(await read('package.json'));
 assert.match(code,/known\.has\(name\)/);
 assert.match(code,/allowedLicenses\.has\(license\)/);
 assert.match(code,/--save-exact/);
 assert.match(code,/--ignore-scripts/);
 assert.match(code,/--no-audit/);
 assert.match(code,/execFileSync\('npm'/);
 assert.match(code,/args\.length>8/);
 assert.match(code,/writeFileSync\(output,code/);
 assert.doesNotMatch(code,/shell\s*:\s*true/);
 assert.match(pkg.scripts['geo:add'],/enable-geolibrary\.mjs/);
 assert.match(pkg.scripts['geo:catalog'],/enable-geolibrary\.mjs --list/);
});
test('The world map exposes a searchable compact catalog instead of loading 100 npm bundles',async()=>{
 const [explore,ui,css,photo]=await Promise.all([
  read('explore-layers.js'),read('geo-library-ui.js'),read('styles.css'),read('photo-sources.js')
 ]);
 assert.match(explore,/attachGeoCatalog\(aside\)/);
 assert.match(ui,/GEO_LIBRARY_CATALOG/);
 assert.match(ui,/search\.addEventListener\('input',render\)/);
 assert.match(ui,/slice\(0,20\)/);
 assert.match(ui,/npm run geo:add -- /);
 assert.match(ui,/navigator\.clipboard/);
 assert.match(css,/explore-market-list/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(explore,/earthlens-tree-volumes-swap/);
 assert.match(explore,/earthlens-3d-tree-canopies-swap/);
 assert.match(explore,/fill-extrusion-opacity-transition/);
 assert.match(explore,/state\.treeEpoch/);
 assert.match(explore,/requestAnimationFrame\(/);
 assert.match(explore,/state\.frameQueue\.submit/);
 assert.match(explore,/explore-photo-progress/);
 assert.match(css,/\.explore-photo-progress\.is-loaded/);
 assert.match(photo,/photoProviders|PHOTO_SOURCES/);
});
