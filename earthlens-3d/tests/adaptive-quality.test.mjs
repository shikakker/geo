import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveQuality,initialQuality,beginMoveFpsSampling} from '../adaptive-quality.js';
import {createSingleFlight,awaitWithSignal} from '../single-flight.js';
import {getWeatherForView,resetWeatherCache} from '../weather-layer.js';

test('Automatic quality conserves RAM and bandwidth without discarding 3D',()=>{
 assert.equal(initialQuality({width:1440,deviceMemory:16,connection:'4g'}),'detail');
 assert.equal(initialQuality({width:430,deviceMemory:8,connection:'4g'}),'smooth');
 assert.equal(initialQuality({width:1440,deviceMemory:2,connection:'4g'}),'smooth');
 assert.equal(initialQuality({width:1440,deviceMemory:16,connection:'3g'}),'smooth');
 assert.equal(initialQuality({width:1440,deviceMemory:16,reducedMotion:true}),'smooth');
 let now=0;const events=[];
 const controller=createAdaptiveQuality({
  environment:{width:1440,deviceMemory:16,connection:'4g'},
  onChange:event=>events.push(event),now:()=>now
 });
 assert.equal(controller.preference,'auto');
 assert.equal(controller.effective,'detail');
 now=5000;
 controller.recordFps(29);controller.recordFps(33);
 assert.equal(controller.effective,'smooth');
 assert.equal(events.at(-1).reason,'low-fps');
 now=10000;
 controller.recordFps(59);controller.recordFps(61);controller.recordFps(60);
 assert.equal(controller.effective,'detail','Repeated fast samples recover high detail');
 controller.setPreference('smooth');
 now=18000;controller.recordFps(100);controller.recordFps(100);controller.recordFps(100);
 assert.equal(controller.effective,'smooth','Manual preference is never overridden by FPS');
 controller.setPreference('auto');
 assert.equal(controller.effective,'detail');
 assert.equal(controller.setPreference('invalid'),false);
});
test('Automatic quality samples animation frames only while map moves',()=>{
 const callbacks={},queued=[],canceled=[];
 const map={on:(name,fn)=>callbacks[name]=fn,off:(name,fn)=>{if(callbacks[name]===fn)delete callbacks[name]}};
 const fpsSamples=[],controller={preference:'auto',recordFps:value=>fpsSamples.push(value)};
 const stop=beginMoveFpsSampling(map,controller,{
  requestFrame:fn=>{queued.push(fn);return queued.length},
  cancelFrame:id=>canceled.push(id)
 });
 assert.equal(queued.length,0,'No continuous animation when idle');
 callbacks.movestart();
 const first=queued.shift();first(0);
 const second=queued.shift();second(250);
 const third=queued.shift();third(500);
 const fourth=queued.shift();fourth(1000);
 assert.equal(fpsSamples.length,1);
 assert.ok(fpsSamples[0]>1&&fpsSamples[0]<10);
 callbacks.moveend();
 const count=queued.length;
 while(queued.length)queued.shift()(1250);
 assert.equal(queued.length,0,'Animation stops on moveend');
 assert.ok(count<=1);
 stop();assert.equal(callbacks.movestart,undefined);
});
test('Single-flight data fetching collapses duplicate in-flight requests',async()=>{
 const q=createSingleFlight();
 let resolve,fetchCount=0;
 const run=()=>q.run('tile:7',()=>{fetchCount++;return new Promise(r=>resolve=r)});
 const a=run(),b=run();
 assert.strictEqual(a,b);
 await Promise.resolve();
 assert.equal(fetchCount,1);
 assert.equal(q.size,1);
 resolve({features:[1,2,3]});
 assert.deepEqual(await a,{features:[1,2,3]});
 await Promise.resolve();
 assert.equal(q.size,0);
 let failureCount=0;
 await assert.rejects(q.run('fail',()=>{failureCount++;throw Error('Temporary outage')}),/Temporary/);
 await assert.rejects(q.run('fail',()=>{failureCount++;throw Error('Temporary outage')}),/Temporary/);
 assert.equal(failureCount,2,'A failed request must not poison the single-flight key');
});
test('A canceled map consumer does not cancel another identical weather request',async()=>{
 resetWeatherCache();
 const a=new AbortController();
 const loc={lat:30.12345,lng:19.54321};
 let requests=0,respond;
 const fetcher=async()=>{requests++;return new Promise(r=>respond=r)};
 const first=getWeatherForView({center:loc,zoom:16,signal:a.signal,fetcher});
 const second=getWeatherForView({center:loc,zoom:16,offsetHours:3,fetcher});
 await Promise.resolve();
 assert.equal(requests,1,'Only one Open-Meteo transport');
 a.abort();
 await assert.rejects(first,/Abort/);
 respond({ok:true,json:async()=>({
  current:{time:'2026-10-16T12:00',temperature_2m:12,weather_code:0},
  hourly:{time:['2026-10-16T12:00','2026-10-16T15:00'],temperature_2m:[12,15],weather_code:[0,1]}
 })});
 const future=await second;
 assert.equal(future[0].properties.temperature,15);
 const cached=await getWeatherForView({center:loc,zoom:16,fetcher});
 assert.equal(cached[0].properties.temperature,12);
 assert.equal(requests,1);
});
test('Client abort races shared completion without altering the transport',async()=>{
 const controller=new AbortController();
 let done;
 const task=new Promise(resolve=>done=resolve);
 const selected=awaitWithSignal(task,controller.signal);
 controller.abort();
 await assert.rejects(selected,{name:'AbortError'});
 done('shared-result');
 assert.equal(await task,'shared-result');
});
