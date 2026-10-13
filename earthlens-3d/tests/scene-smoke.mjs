import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const sceneId=process.env.EARTHLENS_SCENE_ID||'tokyo-chiyoda-plateau';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:850},deviceScaleFactor:1});
const errors=[],providers=[],urls=[];
page.on('pageerror',e=>errors.push(String(e).slice(0,250)));
page.on('console',m=>{if(m.type()==='error')errors.push('console '+m.text().slice(0,350))});
page.on('response',r=>{const u=r.url();if(/plateauview|cesium\.com|api\.cesium/i.test(u)){urls.push({status:r.status(),url:u.slice(0,200)})}});
page.on('requestfailed',r=>{const u=r.url();if(/plateauview|cesium\.com|ion\.cesium/i.test(u))providers.push(r.failure()?.errorText+' '+u.slice(0,150))});
const base=process.env.EARTHLENS_TEST_URL||'http://127.0.0.1:4173';
await mkdir('screenshots',{recursive:true});
try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  await page.locator('#loading.hidden').waitFor({timeout:35000});
  console.log('Initial engine',JSON.stringify(await page.evaluate(()=>window.__earthlensDiagnostics?.())));
  await page.locator('[data-scene="'+sceneId+'"]').click();
  // The main map stays visible while Cesium streams. Wait for real visible geometry.
  await page.waitForFunction(id=>window.__earthlensDiagnostics?.()?.activeScene===id,sceneId,{timeout:55000}).catch(()=>{});
  await page.waitForTimeout(1100);
  const state=await page.evaluate(()=>({
    diagnostic:window.__earthlensDiagnostics?.(),
    cesiumActive:document.getElementById('cesium-scene').classList.contains('active'),
    sceneBanner:document.getElementById('scene-title')?.textContent,
    description:document.getElementById('scene-description')?.textContent,
    loading:document.getElementById('loading')?.className
  }));
  await page.screenshot({path:'screenshots/earthlens-'+sceneId+'.png',animations:'disabled'});
  console.log(JSON.stringify({type:sceneId,state,errors:errors.slice(-12),providerFailures:providers.slice(-12),providerResponses:urls.slice(-12)}));
  assert.equal(state.cesiumActive,true,'A real 3D detail scene must become visible');
  assert.equal(state.diagnostic.activeScene,sceneId,'The correct georeferenced scene must be selected');
  assert.ok(state.diagnostic.sceneVisibleTiles>0,'At least one actual model tile must be rendered');
}finally{await browser.close()}
