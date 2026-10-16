import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GEO_LIBRARY_CATALOG as PREVIOUS} from '../geo-library-catalog.js';
import {GEO_LIBRARY_CATALOG_EXTRA as NEXT,GEO_LIBRARY_GROUPS_EXTRA} from '../geo-library-catalog-extra.js';
import {GEO_LIBRARY_CATALOG,filterGeoLibraries,lookupGeoLibrary} from '../geo-library-combined.js';
import {GEO_ADDONS} from '../geo-addons.js';
import {GEO_ADDONS_NEXT} from '../geo-addons-next.js';
import {GEO_ADDONS_VISUAL} from '../geo-addons-visual.js';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
test('200 distinct optional packages, with 100 actually NEW beyond the previous 100',async()=>{
 const pkg=JSON.parse(await read('package.json'));
 assert.equal(PREVIOUS.length,100);
 assert.equal(NEXT.length,100);
 assert.equal(GEO_LIBRARY_CATALOG.length,200);
 assert.equal(new Set(GEO_LIBRARY_CATALOG.map(x=>x.package)).size,200);
 const core=new Set([...GEO_ADDONS,...GEO_ADDONS_NEXT,...GEO_ADDONS_VISUAL].map(x=>x.id));
 assert.equal(core.size,30);
 for(const item of NEXT){
  assert.ok(!PREVIOUS.some(x=>x.package===item.package),'Existing candidate repeated: '+item.package);
  assert.ok(!core.has(item.package),'Installed core package repeated: '+item.package);
  assert.ok(!Object.hasOwn(pkg.dependencies,item.package),'Opt-in catalog must not install 100 heavyweight packages by default: '+item.package);
  assert.equal(item.status,'available-to-install');
 }
 assert.equal(GEO_LIBRARY_GROUPS_EXTRA.reduce((n,[,v])=>n+v.length,0),100);
 assert.equal(filterGeoLibraries('d3-tile').length,1);
 assert.equal(filterGeoLibraries('@deck.gl').length,5);
 assert.equal(lookupGeoLibrary('leaflet.markercluster')?.package,'leaflet.markercluster');
});
test('All 200 extensions share one searchable, safe, opt-in installer',async()=>{
 const [ui,installer,audit]=await Promise.all([
  read('geo-library-ui.js'),read('scripts/enable-geolibrary.mjs'),
  read('scripts/verify-geolibrary-catalog.mjs')
 ]);
 assert.match(ui,/from '\.\/geo-library-combined\.js'/);
 assert.match(ui,/200 дополнительных GIS-библиотек/);
 assert.match(installer,/from '\.\.\/geo-library-combined\.js'/);
 assert.match(audit,/from '\.\.\/geo-library-combined\.js'/);
 assert.match(installer,/allowedLicenses\.has\(license\)/);
 assert.match(installer,/--save-exact/);
 assert.match(installer,/--ignore-scripts/);
 assert.match(installer,/args\.length>8/);
 // Vite's dynamic imports remain statically generated only after explicitly enabling.
 const loaders=await read('geo-addon-enabled.js');
 assert.doesNotMatch(loaders,/import\(['"]@deck\.gl\//);
 assert.doesNotMatch(loaders,/import\(['"]leaflet\.markercluster/);
});
