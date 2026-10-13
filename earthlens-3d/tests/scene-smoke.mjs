import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import pngjs from 'pngjs';
const {PNG}=pngjs;
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
  const image=await page.screenshot({path:'screenshots/earthlens-'+sceneId+'.png',animations:'disabled'});
  const png=PNG.sync.read(image);
  // Examine the central area, away from top/bottom UI: blank Cesium backgrounds
  // have near-zero luminance deviation, actual geometry has significant detail.
  let samples=0,sum=0,sumSquares=0;
  for(let y=Math.floor(png.height*.32);y<Math.floor(png.height*.78);y+=4){
    for(let x=Math.floor(png.width*.30);x<Math.floor(png.width*.70);x+=4){
      const o=(y*png.width+x)*4;
      const lum=0.299*png.data[o]+0.587*png.data[o+1]+0.114*png.data[o+2];
      sum+=lum;sumSquares+=lum*lum;samples++;
    }
  }
  const variance=Math.max(0,sumSquares/samples-(sum/samples)**2);
  const imageLumaStddev=Math.sqrt(variance);
  console.log(JSON.stringify({type:sceneId,state,errors:errors.slice(-12),providerFailures:providers.slice(-12),providerResponses:urls.slice(-12)}));
  assert.equal(state.cesiumActive,true,'A real 3D detail scene must become visible');
  assert.equal(state.diagnostic.activeScene,sceneId,'The correct georeferenced scene must be selected');
  assert.ok(state.diagnostic.sceneVisibleTiles>0,'At least one actual model tile must be rendered');
  const cityScene=sceneId==='tokyo-chiyoda-plateau'||sceneId==='japan-plateau-cities';
  await page.locator('[data-lod="quality"]').click();
  await page.waitForTimeout(300);
  const quality=await page.evaluate(()=>window.__earthlensDiagnostics?.());
  assert.equal(quality.lodMode,'quality','Quality selection must update the control state');
  assert.equal(await page.locator('[data-lod="quality"]').getAttribute('aria-pressed'),'true');
  assert.equal(quality.lodSSE,cityScene?48:8,
    'Quality LOD must honor the GPU safety floor for PLATEAU, while preserving native KHR splat detail');
  await page.locator('[data-lod="balanced"]').click();
  const balanced=await page.evaluate(()=>window.__earthlensDiagnostics?.());
  assert.equal(balanced.lodMode,'balanced','Balanced selection must update the control state');
  assert.equal(balanced.lodSSE,cityScene?48:16,
    'Balanced LOD must preserve both model quality controls and PLATEAU memory safety');
  console.log('Scene center pixel luma variation',sceneId,imageLumaStddev.toFixed(2));
  assert.ok(imageLumaStddev>=14,'A real 3D model must be visually visible, not a blank tinted Cesium viewport (stddev='+imageLumaStddev.toFixed(2)+')');
}finally{await browser.close()}
