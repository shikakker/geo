import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeocoder,normalizeSearchResults,suggestedZoom,NOMINATIM_URL} from '../geosearch.js';
test('City search picks geographic zoom while building results stay detailed',()=>{
 assert.equal(suggestedZoom(['40','60','-10','20']),5.5);
 assert.equal(suggestedZoom(['52.45','52.59','13.3','13.5']),12);
 assert.equal(suggestedZoom(['40.7486','40.7488','-73.9855','-73.9852']),16.2);
 assert.equal(suggestedZoom(['broken']),15.5);
 assert.equal(suggestedZoom(['-0.01','0.01','179.95','-179.95']),13.7,'Antimeridian crossing must not zoom to world scale');
 const parsed=normalizeSearchResults([
  {place_id:1,lat:'52.5200',lon:'13.4050',display_name:'Berlin, Deutschland',boundingbox:['52.45','52.59','13.3','13.5']},
  {place_id:2,lat:'52.5200',lon:'13.4050',display_name:'duplicate'},
  {place_id:3,lat:'90.5',lon:'0',display_name:'invalid'},
  {place_id:4,lat:'40.7487',lon:'-73.9853',display_name:'Empire State Building, New York'}
 ]);
 assert.equal(parsed.length,2);
 assert.equal(parsed[0].shortName,'Berlin');
 assert.equal(parsed[0].zoom,12);
 assert.equal(parsed[1].zoom,15.5);
});
test('Nominatim search is polite, cached, cancellable and resistant to stale provider data',async()=>{
 let now=10000,requests=0;
 const fetcher=async(url,options)=>{
  requests++;
  assert.match(url,new RegExp('^'+NOMINATIM_URL));
  assert.match(url,/format=jsonv2/);
  assert.match(url,/limit=5/);
  assert.ok(options.signal,'Always apply an abortable timeout');
  return {ok:true,json:async()=>[{place_id:123,lat:'52.52',lon:'13.405',display_name:'Berlin'}]};
 };
 const g=createGeocoder({fetcher,clock:()=>now});
 const berlin=await g.search(' Berlin ');
 assert.equal(berlin[0].shortName,'Berlin');
 assert.equal(requests,1);
 berlin[0].title='changed';
 assert.equal((await g.search('BERLIN'))[0].title,'Berlin','Cache results must be immutable snapshots');
 assert.equal(requests,1);
 await assert.rejects(g.search('Paris'),error=>error?.code==='RATE_LIMIT_LOCAL');
 now=11201;
 await g.search('Paris');
 assert.equal(requests,2);
 const ctl=new AbortController();ctl.abort();
 await assert.rejects(g.search('Tokyo',{signal:ctl.signal}),{name:'AbortError'});
 assert.equal(requests,2);
 await assert.rejects(g.search('x'),/length/);
 assert.equal(g.cachedCount,2);
});
test('Search controller never relies on unsafe HTML and supports keyboard focus',async()=>{
 const {readFile}=await import('node:fs/promises');
 const ui=await readFile(new URL('../geosearch-ui.js',import.meta.url),'utf8');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(ui,/function hide\(focus=false\)/);
 assert.match(ui,/epoch\+\+/);
 assert.match(ui,/controller\?\.abort\(\)/);
 assert.match(ui,/ArrowDown/);
 assert.match(ui,/ArrowUp/);
 assert.match(ui,/aria-expanded/);
 assert.match(ui,/textContent=text/);
 assert.match(ui,/OpenStreetMap \/ Nominatim/);
 assert.match(app,/attachPlaceSearch\(\{/);
 assert.doesNotMatch(app,/async function placeSearch\(/);
});
