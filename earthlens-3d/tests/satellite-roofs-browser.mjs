// Actual browser/GPU acceptance for satellite texture projection.
// Uses deterministic synthetic XYZ imagery ONLY inside CI: production always
// draws licensed, attributed real satellite tiles from the selected provider.
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base = process.env.EARTHLENS_TEST_URL || 'http://127.0.0.1:4173/';
const png = new PNG({width:256,height:256});
for(let y=0;y<256;y++) for(let x=0;x<256;x++){
 const offset=(y*256+x)*4;
 png.data[offset]=Math.floor(100+x*.55);
 png.data[offset+1]=Math.floor(95+y*.52);
 png.data[offset+2]=(Math.floor(x/20)+Math.floor(y/20))%2===0?175:65;
 png.data[offset+3]=255;
}
const fixture=PNG.sync.write(png);
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--ignore-gpu-blocklist',
 '--disable-dev-shm-usage'
]});
await mkdir('screenshots',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1200,height:820},deviceScaleFactor:1});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 // Mock only satellite pixels. The real OpenFreeMap vector building/DEM data
 // and the real WebGL pipeline are still exercised.
 await page.route(url=>url.hostname==='server.arcgisonline.com'&&
  url.pathname.includes('/World_Imagery/MapServer/tile/'),route=>
  route.fulfill({status:200,contentType:'image/png',
   headers:{'access-control-allow-origin':'*'},body:fixture}));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:28000});
 await page.locator('#loading.hidden').waitFor({timeout:38000});
 await page.waitForFunction(()=>{
  const data=window.__earthlensDiagnostics?.();
  return data?.buildings>0 && data?.satelliteRoofs?.enabled===true
   && data?.satelliteRoofs?.roofs>0
   && data?.satelliteRoofs?.ready>0
   && data?.satelliteRoofs?.drawnTriangles>0;
 },null,{timeout:40000});
 const before=await page.evaluate(()=>window.__earthlensDiagnostics().satelliteRoofs);
 assert.ok(before.layer && before.roofs>0 && before.ready>0);
 await page.waitForTimeout(650);
 const withRoofs=PNG.sync.read(await page.locator('#map').screenshot({animations:'disabled'}));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent(
  'earthlens:satellite-changed',{detail:{enabled:false}}
 )));
 await page.waitForFunction(()=>window.__earthlensDiagnostics?.().satelliteRoofs?.enabled===false,
  null,{timeout:7000});
 await page.waitForTimeout(350);
 const withoutRoofs=PNG.sync.read(await page.locator('#map').screenshot({animations:'disabled'}));
 assert.equal(withRoofs.width,withoutRoofs.width);
 assert.equal(withRoofs.height,withoutRoofs.height);
 let difference=0;
 for(let y=65;y<withRoofs.height-65;y+=4){
  for(let x=40;x<withRoofs.width-40;x+=4){
   const i=(y*withRoofs.width+x)*4;
   const delta=Math.abs(withRoofs.data[i]-withoutRoofs.data[i])+
    Math.abs(withRoofs.data[i+1]-withoutRoofs.data[i+1])+
    Math.abs(withRoofs.data[i+2]-withoutRoofs.data[i+2]);
   if(delta>30) difference++;
  }
 }
 assert.ok(difference>120, 'Satellite-textured roof geometry should change visible pixels, got '+difference);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent(
  'earthlens:satellite-changed',{detail:{enabled:true}}
 )));
 await page.waitForFunction(()=>window.__earthlensDiagnostics?.().satelliteRoofs?.ready>0 &&
  window.__earthlensDiagnostics?.().satelliteRoofs?.drawnTriangles>0,
  null,{timeout:22000});
 await page.screenshot({path:'screenshots/earthlens-roofs-textured.png',animations:'disabled'});
 assert.deepEqual(errors,[],'Satellite renderer must not trigger browser JavaScript errors');
 console.log(JSON.stringify({pass:true,satelliteProjection:before,
  visuallyChangedSamples:difference,errors}));
 await context.close();
}finally{await browser.close()}
