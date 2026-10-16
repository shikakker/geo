import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{paramsFromUrl,makeOverpassQuery} from '../api/osm.js';
function fakeResponse(){
 const headers={};let body=null;
 return {headers,statusCode:200,setHeader(key,value){headers[key.toLowerCase()]=value},end(value){body=JSON.parse(value)},get body(){return body}};
}
test('OSM proxy rejects malformed and excessively broad viewport requests',()=>{
 assert.equal(paramsFromUrl('/api/osm?lat=90&lon=0&zoom=16&layers=trees'),null);
 assert.equal(paramsFromUrl('/api/osm?lat=0&lon=999&zoom=16&layers=trees'),null);
 assert.equal(paramsFromUrl('/api/osm?lat=0&lon=0&zoom=3&layers=trees'),null);
 assert.equal(paramsFromUrl('/api/osm?lat=0&lon=0&zoom=17&layers=weather'),null);
 const params=paramsFromUrl('/api/osm?lat=52.370003&lon=4.9&zoom=16&layers=trees,addresses,trees,anything');
 assert.deepEqual(params.layers,['addresses','trees']);
 assert.equal(params.lat,52.37);
 const q=makeOverpassQuery(params);
 assert.match(q,/timeout:14/);
 assert.match(q,/out center 1000/);
 assert.match(q,/addr:housenumber/);
 assert.match(q,/natural/);
 assert.doesNotMatch(q,/https?:|query=|@/);
});
test('OSM same-origin proxy fetches bounded server-side results with CDN caching',async()=>{
 const old=globalThis.fetch;
 let requests=0;
 globalThis.fetch=async (url,opts)=>{
  requests++;
  assert.match(url,/^https:\/\/overpass-api\.de\/api\/interpreter/);
  assert.equal(opts.method,'POST');
  assert.match(opts.body.toString(),/data=/);
  return {ok:true,json:async()=>({elements:[{type:'node',id:102,lat:52.37,lon:4.9,tags:{natural:'tree'}}]})};
 };
 try{
  const request={url:'/api/osm?lat=52.370&lon=4.900&zoom=16&layers=trees',method:'GET'};
  const response=fakeResponse();
  await handler(request,response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.elements.length,1);
  assert.match(response.headers['cache-control'],/s-maxage=600/);
  assert.equal(response.body.elements[0].tags.natural,'tree');
  const second=fakeResponse();
  await handler(request,second);
  assert.equal(requests,1,'Same viewport must not re-query the public service');
  assert.equal(second.body.elements.length,1);
 }finally{globalThis.fetch=old}
});
test('OSM API blocks arbitrary methods and never exposes upstream raw query input',async()=>{
 const method=fakeResponse();
 await handler({method:'POST',url:'/api/osm?lat=0&lon=0&zoom=15&layers=trees'},method);
 assert.equal(method.statusCode,405);
 const invalid=fakeResponse();
 await handler({method:'GET',url:'/api/osm?lat=0&lon=0&zoom=15&layers=weather'},invalid);
 assert.equal(invalid.statusCode,400);
 assert.equal(invalid.body.elements,undefined);
});
