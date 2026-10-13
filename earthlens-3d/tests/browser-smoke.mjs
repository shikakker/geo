import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.EARTHLENS_TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']
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
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if (response.status()>=400 && /(?:earthlens|openfreemap|openstreetmap|assets\/)/.test(response.url()))
      failedResponses.push(response.status()+' '+response.url());
  });
  try {
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
    await page.locator('#loading.hidden').waitFor({timeout:38000});
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
        searchButtonRight:Math.round(document.querySelector('#place-search button[type="submit"]').getBoundingClientRect().right),
      };
    });
    assert.ok(metrics.mapSize[0]>=width-5 && metrics.mapSize[1]>=height-5,'Map must cover viewport');
    assert.ok(metrics.canvasSize || metrics.fallback,'MapLibre canvas or Leaflet raster DOM must exist');
    assert.ok(metrics.spinnerHidden,'Blocking spinner must be removed when map is ready');
    assert.ok(metrics.searchVisible,'Search must remain usable');
    assert.ok(metrics.searchButtonRight<=width+1,'Search submit button must fit inside viewport');
    assert.ok(!errors.some(x=>/does not provide an export named 'default'|Failed to resolve module specifier|SyntaxError/i.test(x)),
      'MapLibre import failed: '+errors.join(' | '));
    await page.screenshot({path:'screenshots/earthlens-'+name+'.png',animations:'disabled'});
    console.log(JSON.stringify({name,pass:true,metrics,pageErrors:errors,failedResponses:failedResponses.slice(0,12)}));
  } catch(e) {
    failed=true;
    await page.screenshot({path:'screenshots/earthlens-'+name+'-failure.png',animations:'disabled'}).catch(()=>{});
    console.error(JSON.stringify({name,pass:false,message:String(e),pageErrors:errors,failedResponses:failedResponses.slice(0,20)}));
  } finally {
    await context.close();
  }
}
await browser.close();
if (failed) process.exitCode=1;
