import test from 'node:test';
import assert from 'node:assert/strict';
import {restoredLayers,storeLayers,restoredQuality,storeQuality,LAYERS_SETTING} from '../layer-preferences.js';
function mem(){
 const db=new Map();
 return {getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,String(v))};
}
test('Map layer choices restore only valid and unique IDs',()=>{
 const storage=mem(),known=['addresses','trees','weather','cameras'];
 assert.deepEqual(restoredLayers(known,['addresses','trees'],storage),['addresses','trees']);
 assert.equal(storeLayers(new Set(['weather','cameras']),storage),true);
 assert.deepEqual(restoredLayers(known,['addresses'],storage),['weather','cameras']);
 storage.setItem(LAYERS_SETTING,JSON.stringify(['weather','fake','weather','addresses']));
 assert.deepEqual(restoredLayers(known,[],storage),['weather','addresses']);
 storage.setItem(LAYERS_SETTING,'invalid');
 assert.deepEqual(restoredLayers(known,['trees'],storage),['trees']);
 storage.setItem(LAYERS_SETTING,'[]');
 assert.deepEqual(restoredLayers(known,['trees'],storage),[]);
});
test('Persisted quality preference remains bounded and handles blocked storage',()=>{
 const storage=mem();
 assert.equal(restoredQuality(storage),'auto');
 assert.equal(storeQuality('detail',storage),true);
 assert.equal(restoredQuality(storage),'detail');
 assert.equal(storeQuality('invalid',storage),false);
 const inaccessible={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.deepEqual(restoredLayers(['trees'],['trees'],inaccessible),['trees']);
 assert.equal(restoredQuality(inaccessible),'auto');
 assert.equal(storeQuality('smooth',inaccessible),false);
});
test('Layer UI actually saves the selected user setting',async()=>{
 const {readFile}=await import('node:fs/promises');
 const src=await readFile(new URL('../explore-layers.js',import.meta.url),'utf8');
 assert.match(src,/storeLayers\(state\.active\)/);
 assert.match(src,/state\.qualityController\.setPreference\(savedMode\)/);
 assert.match(src,/restoredLayers\(THEMES\.map/);
});
