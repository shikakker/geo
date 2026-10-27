import test from 'node:test';
import assert from 'node:assert/strict';
import {createSavedPlaces,normalizeSavedView,SAVED_PLACES_KEY,readSetting,writeSetting} from '../saved-places.js';
function memoryStorage(){
 const m=new Map();
 return {getItem:key=>m.get(key)??null,setItem:(key,value)=>m.set(key,String(value)),snapshot:()=>new Map(m)};
}
test('Favorites round-trip, uniqueness, bounds and user-provided names',()=>{
 const storage=memoryStorage();
 let clock=1000;
 const store=createSavedPlaces({storage,now:()=>clock++,limit:3});
 assert.equal(store.persistent,true);
 assert.equal(store.count,0);
 assert.equal(store.save({lat:91,lng:12}),null);
 assert.equal(store.save({lat:0,lng:Infinity}),null);
 const a=store.save({title:'  Берлин \n №1 ',center:[13.405,52.52],zoom:33,pitch:92,bearing:405});
 assert.equal(a.title,'Берлин   №1');
 assert.equal(a.zoom,20);
 assert.equal(a.pitch,85);
 assert.equal(a.bearing,45);
 assert.deepEqual([a.lat,a.lng],[52.52,13.405]);
 store.save({title:'Берлин новый ракурс',lat:52.52001,lng:13.40503,zoom:16});
 assert.equal(store.count,1,'The same geographic point should not duplicate itself');
 assert.equal(store.list()[0].title,'Берлин новый ракурс');
 store.save({lat:51,lng:5,title:'Нидерланды'});
 store.save({lat:50,lng:4,title:'Бельгия'});
 store.save({lat:40,lng:-74,title:'Нью-Йорк'});
 assert.equal(store.count,3);
 assert.deepEqual(store.list().map(x=>x.title),['Нью-Йорк','Бельгия','Нидерланды']);
 assert.equal(store.remove('not-present'),false);
 assert.equal(store.remove(store.list()[0].id),true);
 assert.equal(store.count,2);
 const copy=store.list();copy[0].title='mutated';
 assert.notEqual(store.list()[0].title,'mutated','Returned snapshots must not expose internal state');
 const restored=createSavedPlaces({storage});
 assert.equal(restored.count,2);
 assert.equal(restored.list()[0].title,'Бельгия');
 assert.equal(restored.clear(),true);
 assert.equal(createSavedPlaces({storage}).count,0);
});
test('Favorites handle disabled storage, corrupted JSON and subscribe without crashing',()=>{
 const broken={getItem(){throw Error('SecurityError')},setItem(){throw Error('QuotaExceededError')}};
 const store=createSavedPlaces({storage:broken});
 assert.equal(store.persistent,false);
 let changes=0;
 const unsubscribe=store.subscribe(()=>changes++);
 const saved=store.save({title:'Offline',lat:35.68,lng:139.69});
 assert.equal(saved.title,'Offline');
 assert.equal(store.count,1);
 assert.equal(store.persistent,false);
 assert.equal(changes,1);
 unsubscribe();
 store.remove(saved.id);
 assert.equal(changes,1);
 assert.equal(readSetting('earthlens:lod','auto',broken),'auto');
 assert.equal(writeSetting('earthlens:lod','detail',broken),false);
 const invalid=memoryStorage();
 invalid.setItem(SAVED_PLACES_KEY,'broken');
 assert.equal(createSavedPlaces({storage:invalid}).count,0);
});
test('Saved map views reject corrupted fields and preserve privacy',async()=>{
 assert.equal(normalizeSavedView({lat:NaN,lng:1}),null);
 assert.equal(normalizeSavedView({lat:1,lng:181}),null);
 const entry=normalizeSavedView({lat:0,lng:180,zoom:1,pitch:-20,bearing:-540,title:'<script>alert(1)</script>'},10);
 assert.equal(entry.zoom,2);
 assert.equal(entry.pitch,0);
 assert.ok(entry.title.includes('<script>'),'Titles remain plain text; UI must use textContent');
 const ui=await (await import('node:fs/promises')).readFile(new URL('../saved-places-ui.js',import.meta.url),'utf8');
 assert.match(ui,/\.textContent=text/);
 assert.match(ui,/aria-label/);
 assert.match(ui,/open\.addEventListener\('click'/);
 assert.match(ui,/saved-places-privacy/);
 const app=await (await import('node:fs/promises')).readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/mountSavedPlaces\(/);
 assert.match(app,/readSetting\('earthlens:lod'\)/);
 assert.doesNotMatch(app,/localStorage\.getItem\('earthlens:lod'\)/);
});


test('blank and missing coordinates never create false saved places at (0,0)',()=>{
 for(const invalid of [
  {lat:'',lng:''},
  {lat:' ',lng:' '},
  {lat:null,lng:null},
  {lat:[],lng:[]},
  {center:[null,null]},
  {center:['','']}
 ])assert.equal(normalizeSavedView(invalid),null,JSON.stringify(invalid));
 const valid=normalizeSavedView({lat:0,lng:'0',title:'Greenwich / Equator'});
 assert.deepEqual([valid.lat,valid.lng],[0,0]);
});
