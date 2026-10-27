import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{resetCameraCache} from '../api/cameras.js';
import {normalizeCameras} from '../camera-source.js';
function fakeResponse(){
 const headers={};let payload=null;
 return {statusCode:200,headers,setHeader(k,v){headers[k.toLowerCase()]=v},end(x){payload=JSON.parse(x)},get payload(){return payload}};
}
const station=(id,{lon=24.94,lat=60.17,active=true}={})=>({
 type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},
 properties:{id,name:'Helsinki station',state:active?'ACTIVE':'INACTIVE',
  collectionStatus:active?'IN_COLLECTION':'REMOVED',
  presets:[{id,inCollection:true},{id:'C1234567',inCollection:false}]}
});
test('Camera normalizer only publishes provider-collected Finnish stations',()=>{
 const result=normalizeCameras({features:[
  station('C1451601'),station('C1451601'),
  station('C1459991',{lon:4.9,lat:52.37}),
  station('C1459992',{active:false}),
  station('https://malicious.invalid/a.jpg'),
  {geometry:{type:'Point',coordinates:[25,61]},properties:{presets:[{id:'C8800001',inCollection:false}]}}
 ]});
 assert.equal(result.length,1);
 assert.equal(result[0].id,'camera:C1451601');
 assert.match(result[0].properties._image,/^https:\/\/weathercam\.digitraffic\.fi\/C1451601\.jpg$/);
 assert.equal(result[0].properties._kind,'cameras');
 assert.equal(result[0].properties.country,'Finland');
 assert.equal(result[0].geometry.coordinates[0],24.94);
 assert.deepEqual(normalizeCameras({features:[]}),[]);
});
test('CORS-safe camera proxy caches, deduplicates provider calls and sends attribution',async()=>{
 resetCameraCache();
 let hits=0,finish;
 const saved=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  hits++;
  assert.match(url,/digitraffic\.fi\/api\/weathercam\/v1\/stations/);
  assert.equal(opts.method,'GET');
  assert.match(opts.headers['Digitraffic-User'],/EarthLens/);
  await new Promise(resolve=>finish=resolve);
  return {ok:true,json:async()=>({features:[station('C1451601')]})};
 };
 try{
  const req={method:'GET',url:'/api/cameras'},a=fakeResponse(),b=fakeResponse();
  const requests=[handler(req,a),handler(req,b)];
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(hits,1);
  finish();
  await Promise.all(requests);
  assert.equal(a.statusCode,200);
  assert.equal(b.payload.features.length,1);
  assert.match(a.headers['cache-control'],/s-maxage=600/);
  const c=fakeResponse();
  await handler(req,c);
  assert.equal(hits,1,'10-minute camera metadata requests must be cached');
  assert.equal(c.payload.source,'Fintraffic Digitraffic');
  const method=fakeResponse();await handler({method:'POST'},method);
  assert.equal(method.statusCode,405);
 }finally{globalThis.fetch=saved;resetCameraCache()}
});
test('Camera provider failure responds bounded 503, never fabricates a live stream',async()=>{
 resetCameraCache();
 const saved=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('provider offline')};
 try{
  const response=fakeResponse();
  await handler({method:'GET'},response);
  assert.equal(response.statusCode,503);
  assert.deepEqual(response.payload.features,[]);
 }finally{globalThis.fetch=saved;resetCameraCache()}
});
