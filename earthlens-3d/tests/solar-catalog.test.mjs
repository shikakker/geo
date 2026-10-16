import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {solarPosition} from '../solar-position.js';
const root=new URL('../',import.meta.url);
test('Lazy SunCalc computes real solar altitude and bearing without web API',async()=>{
 const at=new Date('2026-03-20T12:00:00Z');
 const result=await solarPosition({lat:0,lon:0,at});
 assert.ok(result&&result.altitude>80&&result.altitude<=90);
 assert.ok(result.azimuth>=0&&result.azimuth<360);
 assert.equal(result.daylight,true);
 assert.match(result.provider,/SunCalc/);
 assert.equal(await solarPosition({lat:100,lon:0,at}),null);
});
test('Solar calculation is injected and can run without npm/network in tests',async()=>{
 let called=0;
 const result=await solarPosition({lat:52.37,lon:4.9,at:new Date('2026-10-16T12:00:00Z'),loader:async id=>{
  assert.equal(id,'suncalc');called++;
  return {default:{getPosition:()=>({altitude:Math.PI/4,azimuth:0})}};
 }});
 assert.equal(called,1);
 assert.equal(result.altitude,45);
 assert.equal(result.azimuth,180);
});
test('One-command catalog listing works offline and reports 100 candidate packages',()=>{
 const output=execFileSync(process.execPath,[new URL('../scripts/enable-geolibrary.mjs',import.meta.url).pathname,'--list'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:10000});
 assert.match(output,/Total new catalog packages: 100; enabled: 1/);
 assert.match(output,/suncalc/);
});
