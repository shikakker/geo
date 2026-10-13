import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.EARTHLENS_TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']
});
await mkdir('screenshots',{recursive:true});
let failed = false;

for (const {name,width,height,isMobile} of [
  {name:'desktop',width:1440,height:900,isMobile:false},
  {name:'mobile',width:431,height:845,isMobile:true}
]) {
  const context = await browser.newContext({viewport:{width,height},isMobile,hasTouch:isMobile,deviceScaleFactor:1});
  const page = await context.newPage();
  const errors = [];
  const failedResponses = [];
  const consoleWarnings=[];
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')consoleWarnings.push(m.type()+': '+m.text().slice(0,180))});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if (response.status()>=400 && /(?:earthlens|openfreemap|openstreetmap|assets\/)/.test(response.url()))
      failedResponses.push(response.status()+' '+response.url());
  });
  try {
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
    await page.locator('#loading.hidden').waitFor({timeout:38000});
    // Camera starts over Midtown at zoom 16.35 where global OSM has 3D buildings.
    await page.waitForFunction(()=>window.__earthlensDiagnostics?.().buildings>0,{timeout:16000}).catch(()=>{});
    await page.waitForTimeout(850);
    const metrics = await page.evaluate(()=>{
      const map=document.getElementById('map');
      const rect=map.getBoundingClientRect();
      const canvas=map.querySelector('canvas.maplibregl-canvas');
      const raster=map.querySelector('.leaflet-pane');
      const tiles=map.querySelectorAll('.leaflet-tile-loaded');
      return {
        mapSize:[Math.round(rect.width),Math.round(rect.height)],
        canvasSize:canvas?[canvas.width,canvas.height]:null,
        fallback:!!raster,
        rasterTiles:tiles.length,
        spinnerHidden:document.getElementById('loading').classList.contains('hidden'),
        searchVisible:document.getElementById('search-text').getBoundingClientRect().width>50,
        bodyScrollWidth:document.body.scrollWidth,
        engine:window.__earthlensDiagnostics?.()?.engine||null,
        buildingCount:window.__earthlensDiagnostics?.()?.buildings||0,
        hasCanvas2dBuildings:!!document.querySelector('.earthlens-25d-buildings'),
        webgl2:!!document.createElement('canvas').getContext('webgl2'),
        searchButtonRight:Math.round(document.querySelector('#place-search button[type="submit"]').getBoundingClientRect().right),
      };
    });
    assert.ok(metrics.mapSize[0]>=width-5 && metrics.mapSize[1]>=height-5,'Map must cover viewport');
    assert.ok(metrics.canvasSize || metrics.fallback,'MapLibre canvas or Leaflet raster DOM must exist');
    assert.ok(metrics.buildingCount>0,'No real OpenStreetMap building volumes loaded in the city center; engine='+metrics.engine);
    if(metrics.fallback)assert.ok(metrics.hasCanvas2dBuildings,'Fallback must draw 2.5D buildings on Canvas2D');
    if(metrics.webgl2)assert.equal(metrics.engine,'webgl-3d','WebGL2 is present: show the native tilted 3D globe/building renderer, not a flat fallback');
    else assert.equal(metrics.engine,'webgl-3d','WebGL map must operate in true 3D mode');
    assert.ok(metrics.spinnerHidden,'Blocking spinner must be removed when map is ready');
    assert.ok(metrics.searchVisible,'Search must remain usable');
    assert.ok(metrics.searchButtonRight<=width+1,'Search submit button must fit inside viewport');
    assert.ok(!errors.some(x=>/does not provide an export named 'default'|Failed to resolve module specifier|SyntaxError/i.test(x)),
      'MapLibre import failed: '+errors.join(' | '));
    await page.screenshot({path:'screenshots/earthlens-'+name+'.png',animations:'disabled'});
    console.log(JSON.stringify({name,pass:true,metrics,pageErrors:errors,consoleWarnings:consoleWarnings.slice(0,12),failedResponses:failedResponses.slice(0,12)}));
  } catch(e) {
    failed=true;
    await page.screenshot({path:'screenshots/earthlens-'+name+'-failure.png',animations:'disabled'}).catch(()=>{});
    console.error(JSON.stringify({name,pass:false,message:String(e),pageErrors:errors,consoleWarnings:consoleWarnings.slice(0,16),failedResponses:failedResponses.slice(0,20)}));
  } finally {
    await context.close();
  }
}
await browser.close();
if (failed) process.exitCode=1;
