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
  // Deterministic weather API fixture verifies actual overlay behavior without
  // consuming the public Open-Meteo quota in CI.
  await page.route(url=>url.hostname==='api.open-meteo.com'&&url.pathname==='/v1/forecast',async route=>{
    const url=new URL(route.request().url());
    const points=(url.searchParams.get('latitude')||'').split(',').map(Number);
    const record=()=>{
      const current={time:'2026-10-16T12:00',temperature_2m:17.4,weather_code:2,apparent_temperature:16.2,
        wind_speed_10m:13.2,wind_direction_10m:60,cloud_cover:45,precipitation:0,relative_humidity_2m:63,pressure_msl:1015};
      const times=['2026-10-16T12:00','2026-10-16T15:00','2026-10-16T18:00','2026-10-17T00:00'];
      const hourly={time:times};
      for(const [key,value] of Object.entries(current)){
        if(key==='time')continue;
        hourly[key]=[value,key==='temperature_2m'?21.6:value,key==='temperature_2m'?16.3:value,key==='temperature_2m'?10.2:value];
      }
      return {current,hourly};
    };
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
      body:JSON.stringify(points.length>1?points.map(record):record())});
  });

  // Exercise the same-origin geodata layer deterministically; the server-side
  // route is independently tested in tests/osm-api.test.mjs.
  await page.route(url=>url.pathname==='/api/osm',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:[
      {type:'node',id:90001,lat:40.74873,lon:-73.98531,tags:{'addr:street':'Fifth Avenue','addr:housenumber':'350',name:'Example address'}},
      {type:'node',id:90002,lat:40.74866,lon:-73.98525,tags:{natural:'tree',height:'9',name:'Example tree'}}
    ]})});
  });
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
    await page.locator('.explore-addresses').first().waitFor({state:'visible',timeout:16000});
    await page.locator('.explore-trees').first().waitFor({state:'visible',timeout:16000});
    await page.screenshot({path:'screenshots/earthlens-'+name+'.png',animations:'disabled'});
    // Weather must render without waiting for a slow/failed Overpass request.
    await page.locator('[data-explore-layer="weather"]').click();
    const marker=page.locator('.explore-weather').first();
    await marker.waitFor({state:'visible',timeout:17000});
    assert.match(await marker.innerText(),/17°/,'Weather icon must contain provider data');
    await marker.locator('.explore-wx-arrow').waitFor({state:'visible',timeout:6000});
    assert.match(await marker.locator('.explore-wx-arrow').getAttribute('style'),/rotate\(240deg\)/,
      'Wind direction FROM 60 degrees must draw arrow TOWARDS 240 degrees');
    await page.waitForFunction(()=>window.__earthlensDiagnostics?.().weatherWindLayer===true,null,{timeout:14000});
    await marker.click();
    const detail=page.locator('#explore-detail');
    await detail.locator('.explore-weather-cell').first().waitFor({timeout:6000});
    assert.match(await detail.innerText(),/Open-Meteo/);
    assert.match(await detail.innerText(),/17.4/);
    assert.equal(await page.locator('#earthlens-stream-status').count(),1,'Map tile progress indicator must exist');
    await page.locator('[data-weather-hour="3"]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.explore-weather')].some(el=>el.textContent.includes('22°')),null,{timeout:17000});
    await marker.click();
    assert.match(await detail.innerText(),/21.6/,'Forecast +3h must use hourly provider data');
    assert.match(await detail.innerText(),/прогноз \+3 ч/,'Forecast card must label prediction horizon');
    await page.locator('#explore-detail .explore-detail-head button').click();
    await page.locator('[data-render-quality="detail"]').click();
    assert.equal(await page.locator('[data-render-quality="detail"]').getAttribute('aria-pressed'),'true',
      'Detail mode must be an accessible interactive choice');
    await page.locator('[data-render-quality="smooth"]').click();
    assert.equal(await page.locator('[data-render-quality="smooth"]').getAttribute('aria-pressed'),'true',
      'User must be able to switch back to smooth mode');
    await page.screenshot({path:'screenshots/earthlens-'+name+'-weather.png',animations:'disabled'});
    assert.ok(!errors.some(x=>/SyntaxError|does not provide an export|Failed to resolve module specifier/.test(x)),'Progressive weather map must not throw module errors');
    console.log(JSON.stringify({name,pass:true,metrics,weather:true,pageErrors:errors,consoleWarnings:consoleWarnings.slice(0,12),failedResponses:failedResponses.slice(0,12)}));
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
