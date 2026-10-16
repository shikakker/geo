#!/usr/bin/env node
// Catalog audit (optional network check). npm registry is only queried by
// maintainer/CI, never by visitors opening the map.
import {GEO_LIBRARY_CATALOG} from '../geo-library-catalog.js';
const allowed=/\b(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|CC0-1\.0|Unlicense|BlueOak-1\.0\.0|BSD)\b/i;
async function verify(item){
 const endpoint='https://registry.npmjs.org/'+encodeURIComponent(item.package)+'/latest';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9500);
 try{
  const response=await fetch(endpoint,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)return {name:item.package,status:'http-'+response.status};
  const info=await response.json();
  const license=typeof info.license==='string'?info.license:'unknown';
  // SunCalc's registry record omits SPDX, but its upstream repository
  // publishes a BSD-2-Clause LICENSE: https://github.com/mourner/suncalc/blob/master/LICENSE.
  const upstreamReviewed=item.package==='suncalc'&&license==='unknown';
  const acceptable=allowed.test(license)||upstreamReviewed;
  return {name:item.package,status:acceptable?'verified':'license-review',version:info.version,
   license:upstreamReviewed?'BSD-2-Clause (upstream LICENSE)':license};
 }catch(error){return {name:item.package,status:'network-error',detail:String(error.message||error).slice(0,100)}}
 finally{clearTimeout(timeout)}
}
const items=GEO_LIBRARY_CATALOG.slice();
let index=0;
const results=[];
async function worker(){
 while(index<items.length){const current=items[index++];results.push(await verify(current))}
}
await Promise.all(Array.from({length:5},()=>worker()));
results.sort((a,b)=>a.name.localeCompare(b.name));
const invalid=results.filter(item=>item.status!=='verified');
const summary={total:results.length,verified:results.length-invalid.length,missing:invalid.filter(x=>x.status.startsWith('http-')).length,review:invalid};
console.log(JSON.stringify(summary,null,2));
if(invalid.length)process.exitCode=1;
