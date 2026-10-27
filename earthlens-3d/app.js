import * as maplibregl from 'maplibre-gl';
import {initExploreLayers,updateExploreMap,showExploreAt,getExploreQuality} from './explore-layers.js';
import {createMapProgress,watchMapTiles} from './map-progress.js';
import {preserveEarthLensOverlays} from './style-transition.js';
import {createSatelliteRoofProjection,WORLD_IMAGERY_TILE_URL,
 WORLD_IMAGERY_ATTRIBUTION} from './satellite-roofs.js';
import {restoredImagery} from './layer-preferences.js';
import {mountSavedPlaces} from './saved-places-ui.js';
import {readSetting,writeSetting} from './saved-places.js';
import {attachPlaceSearch} from './geosearch-ui.js';
import {mountProductHelp} from './product-help.js';
import {version as APP_VERSION} from './package.json';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'leaflet/dist/leaflet.css';
import {attachCanvasBuildingLayer} from './fallback-3d.js';
import {LOD_PRESETS,isLodMode,lodSSE,applyLod,isSceneEnabled} from './cesium-lod.js';
// MapLibre v6 uses a separate worker. Vite must bundle it via ?worker&url.
maplibregl.setWorkerUrl(maplibreWorkerUrl);
const $ = id => document.getElementById(id);
const BASE_STYLES=[
  {name:'Liberty',url:'https://tiles.openfreemap.org/styles/liberty'},
  {name:'Bright',url:'https://tiles.openfreemap.org/styles/bright'},
  {name:'Positron',url:'https://tiles.openfreemap.org/styles/positron'},
  {name:'Fiord',url:'https://tiles.openfreemap.org/styles/fiord'},
  {name:'Dark',url:'https://tiles.openfreemap.org/styles/dark'}
];
const MAP_STYLE=BASE_STYLES[0].url;
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const ION_PUBLIC_TOKEN = String(import.meta.env.VITE_CESIUM_ION_PUBLIC_TOKEN || '').trim();
const CESIUM_WORLD_TERRAIN = import.meta.env.VITE_CESIUM_WORLD_TERRAIN === 'true';
const CESIUM_VERSION = '1.141';
const CESIUM_JS = 'https://cesium.com/downloads/cesiumjs/releases/' + CESIUM_VERSION + '/Build/Cesium/Cesium.js';
const CESIUM_CSS = 'https://cesium.com/downloads/cesiumjs/releases/' + CESIUM_VERSION + '/Build/Cesium/Widgets/widgets.css';
// Midtown is deliberately the starting point: 3D skyscrapers are unmistakable.
const defaultView = { center: [-73.9853, 40.7487], zoom: 16.35, pitch: 67, bearing: -24 };
const app = { map:null, scenes:[], marker:[], terrainAdded:false, is3d:true, activeScene:null, sceneLoading:null, sceneEpoch:0, cesium:null, viewer:null, splatControl:null, splatIds:new Set(), photoRequest:0, geosearchAt:0, tiltInProgress:false, userCamera3d:true, pendingToken:0, satelliteRoofs:null, fallbackActive:false, fallbackStarting:false, leaflet:null, leafletLib:null, mapReady:false, bootTimer:null, styleIndex:0, tileErrors:0, sceneDataLoaded:false, cityMode:'osm-3d', canvasBuildings:null, globeActive:false, renderedBuildings:0, failedScenes:new Map(), sceneCooldownUntil:0, sceneEntry:null, sceneVisibleTiles:0, lodMode:isLodMode(readSetting('earthlens:lod'))?readSetting('earthlens:lod'):'auto',placesHub:null, lodTileset:null, lodProgress:{pending:0,processing:0}, lodSource:null, lodDebug:false };
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const fmt=n=>Number(n).toFixed(4);
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const degrees=x=>x*Math.PI/180;
const meters=(a,b,c,d)=>{const dp=degrees(c-a),dl=degrees(d-b),h=Math.sin(dp/2)**2+Math.cos(degrees(a))*Math.cos(degrees(c))*Math.sin(dl/2)**2;return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));};
let toastTimer;
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4600)}
function setMode(status,label){$('mode-label').textContent=status;$('quality-label').textContent=label}
function parseHash(){const p=location.hash.replace(/^#/,'').split('/').map(Number);if(p.length===5&&p.every(Number.isFinite)&&Math.abs(p[1])<=85&&Math.abs(p[2])<=180)return{zoom:clamp(p[0],2,20),center:[p[2],p[1]],bearing:p[3],pitch:clamp(p[4],0,85)};return defaultView}
function storeCamera(){if(!app.map||app.activeScene)return;const m=app.map,c=m.getCenter();history.replaceState(null,'','#'+[m.getZoom().toFixed(2),c.lat.toFixed(5),c.lng.toFixed(5),m.getBearing().toFixed(0),m.getPitch().toFixed(0)].join('/'))}
function showPosition(){if(!app.map)return;const c=app.map.getCenter();$('coords').textContent=fmt(Math.abs(c.lat))+'°'+(c.lat>=0?'N':'S')+' · '+fmt(Math.abs(c.lng))+'°'+(c.lng>=0?'E':'W');$('zoom-label').textContent='ZOOM '+app.map.getZoom().toFixed(1)}
function locateNearestScene(){
  if(!app.map||!app.scenes.length||app.fallbackActive||Date.now()<app.sceneCooldownUntil)return null;
  const center=app.map.getCenter(),zoom=app.map.getZoom();
  const matches=app.scenes.filter(scene=>{
    if(zoom<scene.activationZoom||Date.now()<(app.failedScenes.get(scene.id)||0))return false;
    if(scene.type==='3dtiles-region'){
      if(!Array.isArray(scene.bounds)||scene.bounds.length!==4)return false;
      const [west,south,east,north]=scene.bounds;
      return center.lng>=west&&center.lng<=east&&center.lat>=south&&center.lat<=north;
    }
    return meters(center.lat,center.lng,scene.latitude,scene.longitude)<=scene.activationRadiusMeters;
  });
  // Specific captures / municipality data take precedence over nationwide aggregates.
  return matches.sort((a,b)=>{
    const rank=scene=>scene.type==='3dtiles-region'?10:scene.type==='3dtiles-model'?4:0;
    return rank(a)-rank(b)
      || meters(center.lat,center.lng,a.latitude,a.longitude)-meters(center.lat,center.lng,b.latitude,b.longitude);
  })[0]||null;
}
function closestNearby(){if(!app.map)return null;const center=app.map.getCenter();return app.scenes.map(scene=>({scene,distance:meters(center.lat,center.lng,scene.latitude,scene.longitude)})).sort((a,b)=>a.distance-b.distance)[0]||null}
function updateGuidance(){
  if(app.activeScene)return;
  if(app.fallbackActive){const n=app.canvasBuildings?.count||0;
    $('guidance').textContent=app.map.getZoom()>=14.4
      ?'Дома объёмные в резервном Canvas-режиме ('+n+' объектов данных). Для настоящего 3D и Gaussian нужен WebGL2.'
      :'Приближайте город: резервный Canvas-движок автоматически создаст объём домов по базе OpenStreetMap.';
    setMode('CANVAS 2.5D',n?'OSM · '+n+' ОБЪЕКТОВ':'РЕЗЕРВ БЕЗ WEBGL');return;
  }
  const z=app.map.getZoom();const nearby=closestNearby();
  if(z<12){$('guidance').textContent='Вращайте глобус и приближайтесь к городу. Здания автоматически превратятся в объёмные модели на карте.';setMode('GLOBE','ГЛОБУС · DEM')}
  else if(z<15.8){$('guidance').textContent='Появляются реальные объёмы зданий: контуры OpenStreetMap, высоты и рельеф. Приближайте дальше для подробностей.';setMode('BUILDINGS 3D','OSM · ОБЪЁМНЫЕ ЗДАНИЯ')}
  else{const hint=nearby&&nearby.distance<350?'Ещё приблизьте отметку ✳ — подключится настоящая KHR Gaussian Splat-сцена.':'Все доступные OSM-здания объёмные. Детальные PLATEAU 3D Tiles и Gaussian-сканы появляются только в регионах с реальными данными.';$('guidance').textContent=hint;setMode('3D DETAIL','ВЫСОТЫ · OPENSTREETMAP')}
}
/**
 * Globally available building extrusions driven by the real OpenFreeMap
 * building source layer (OSM). Not Gaussian splats: those require captures.
 * Source identity is explicit: style-dependent source IDs are not reliable.
 */
function initOpenBuildings(){
  const map=app.map;
  if(!map?.isStyleLoaded()||app.fallbackActive)return;
  const id='earthlens-3d-buildings';
  if(map.getLayer(id))return;
  const style=map.getStyle();
  const layers=style.layers||[];
  const registered=layers.find(l=>l['source-layer']==='building'&&style.sources?.[l.source]?.type==='vector');
  let source=registered?.source;
  if(!source){
    source='earthlens-osm-planet';
    if(!map.getSource(source))map.addSource(source,{type:'vector',url:'https://tiles.openfreemap.org/planet'});
  }
  const height=['coalesce',['to-number',['get','render_height']],['to-number',['get','height']],12];
  const baseColor=['interpolate',['linear'],height,0,'#b5c5b8',18,'#c5cabe',55,'#d9c7aa',135,'#e7c9a5',280,'#f3dcc2'];
  // Honor mapped facade materials, without presenting synthetic photographs.
  const materials=['downcase',['to-string',['coalesce',['get','building:material'],['get','material'],'']]];
  const facadeColor=['match',materials,
   'brick','#bb8775','concrete','#b7bcb8','glass','#9eb9c5',
   'stone','#c7bda7','wood','#a88d6b','metal','#acb9c4',baseColor];
  const minHeight=['coalesce',['to-number',['get','render_min_height']],['to-number',['get','min_height']],0];
  const before=layers.find(l=>l.type==='symbol'&&l.layout?.['text-field'])?.id
    ||layers.find(l=>l.type==='symbol')?.id;
  const extrusions={
    id,type:'fill-extrusion',source,'source-layer':'building',minzoom:13.3,
    filter:['!=',['get','hide_3d'],true],
    paint:{
      'fill-extrusion-color':facadeColor,
      'fill-extrusion-height':['interpolate',['linear'],['zoom'],13.4,0,14.2,height],
      'fill-extrusion-base':['interpolate',['linear'],['zoom'],13.4,0,14.2,minHeight],
      'fill-extrusion-opacity':window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0.94:0,
      'fill-extrusion-opacity-transition':{duration:900,delay:0}
    }
  };
  try{
    map.addLayer(extrusions,before);
    requestAnimationFrame(()=>{if(map.getLayer(id))map.setPaintProperty(id,'fill-extrusion-opacity',0.94)});
    // Hide duplicate 3D building layers only after the new layer succeeds.
    for(const layer of layers)if(layer.type==='fill-extrusion'&&layer['source-layer']==='building'&&layer.id!==id){
      try{map.setLayoutProperty(layer.id,'visibility','none')}catch{}
    }
    if(typeof map.setLight==='function')try{
      map.setLight({anchor:'viewport',color:'#ffffff',intensity:0.48,position:[1.15,215,40]});
    }catch{}
    console.info('EarthLens OSM 3D buildings ready',source);
  }catch(error){console.error('3D building renderer:',error);toast('Здания: проблемы с 3D-слоем, карта остаётся доступной')}
}
function updateProjection(){
  if(app.fallbackActive||!app.map||typeof app.map.setProjection!=='function')return;
  const z=app.map.getZoom();
  const globe=z<=6.7;
  if(globe===app.globeActive)return;
  try{app.map.setProjection({type:globe?'globe':'mercator'});app.globeActive=globe}
  catch(error){console.warn('Projection fallback:',error)}
}
function updateBuildingStatistics(){
  if(app.fallbackActive||!app.map?.getLayer?.('earthlens-3d-buildings'))return;
  const z=app.map.getZoom();
  if(z<13.7){app.renderedBuildings=0;return}
  try{
    const features=app.map.queryRenderedFeatures({layers:['earthlens-3d-buildings']});
    app.renderedBuildings=features.length;
    if(z>=15&&features.length>0){
      $('quality-label').textContent='3D · '+features.length+' ЗДАНИЙ НА ЭКРАНЕ';
      $('layers-label').textContent='3D-ЗДАНИЯ · OPENSTREETMAP';
    }
  }catch(error){console.warn('3D stats:',error)}
}
function initTerrain(){const m=app.map;if(!m.isStyleLoaded())return;try{if(!m.getSource('earthlens-elevation'))m.addSource('earthlens-elevation',{type:'raster-dem',tiles:[DEM_URL],tileSize:256,maxzoom:14,encoding:'terrarium',attribution:'Elevation © AWS Terrain Tiles / Mapzen'});m.setTerrain({source:'earthlens-elevation',exaggeration:1.15})}catch(err){console.warn('Terrain unavailable in this browser:',err)}}
function styleLoaded(){initOpenBuildings();initTerrain();updateProjection();app.satelliteRoofs?.ensure()}
function maybeTilt(){if(app.tiltInProgress||!app.userCamera3d||app.activeScene||app.sceneLoading)return;const m=app.map,z=m.getZoom();if(z>=14.4&&m.getPitch()<35){app.tiltInProgress=true;m.easeTo({pitch:60,duration:620});setTimeout(()=>app.tiltInProgress=false,700)}else if(z<11.6&&m.getPitch()>24){app.tiltInProgress=true;m.easeTo({pitch:0,duration:620});setTimeout(()=>app.tiltInProgress=false,700)}}
function cameraMoved(){window.dispatchEvent(new Event('earthlens:camera-moved'));showPosition();storeCamera();updateGuidance();updateProjection();updateBuildingStatistics();maybeTilt();if(app.sceneLoading){const nearest=locateNearestScene();if(!nearest||nearest.id!==app.sceneLoading.id){app.sceneEpoch++;app.sceneLoading=null;cleanBanner()}return}const chosen=locateNearestScene();if(chosen)void enterScene(chosen)}
function sampleFly(){const scene=app.scenes[0];if(!scene){toast('Геопривязанных Gaussian-сцен пока нет');return}app.sceneCooldownUntil=0;app.failedScenes.delete(scene.id);app.map.flyTo({center:[scene.longitude,scene.latitude],zoom:scene.activationZoom+0.15,pitch:63,bearing:-15,duration:2000});toast('Приблизьте ещё на один шаг: KHR-скан загрузится автоматически')}
function drawScenePins(){
  for(const marker of app.marker)try{marker.remove()}catch{}
  app.marker=[];
  for(const scene of app.scenes){
    if(scene.type==='3dtiles-region')continue; // Nationwide datasets are automatic, not a pin in Tokyo.
    const el=document.createElement('button');el.type='button';el.className='scan-marker';el.textContent=scene.type==='3dtiles-model'?'▰':'✳';
    el.title='Геопривязанные данные 3D: '+scene.name;
    el.setAttribute('aria-label','Приблизиться к детальной 3D-модели');
    const fly=()=>app.map.flyTo({center:[scene.longitude,scene.latitude],zoom:scene.activationZoom+0.1,pitch:65,bearing:-15,duration:1700});
    if(app.fallbackActive&&app.leafletLib&&app.leaflet){
      const div=app.leafletLib.divIcon({className:'leaflet-scan-icon',html:'<span class="scan-marker">'+(scene.type==='3dtiles-model'?'▰':'✳')+'</span>',iconSize:[38,38],iconAnchor:[19,19]});
      const marker=app.leafletLib.marker([scene.latitude,scene.longitude],{icon:div}).addTo(app.leaflet);
      marker.on('click',fly);app.marker.push(marker);
    }else{
      el.addEventListener('click',fly);
      app.marker.push(new maplibregl.Marker({element:el}).setLngLat([scene.longitude,scene.latitude]).addTo(app.map));
    }
  }
}
function showBuilding(e){if(app.activeScene)return;let feat;try{feat=app.map.queryRenderedFeatures(e.point,{layers:['earthlens-3d-buildings']})[0]}catch{}const p=feat?.properties||{};const h=Number(p.render_height??p.height);const height=Number.isFinite(h)&&h>0?h:null;const levels=Number(p['building:levels']??p.levels);const floors=Number.isFinite(levels)&&levels>0?Math.round(levels):null;const estimate=floors===null&&height!==null?Math.max(1,Math.round(height/3.2)):null;const n=p.name||p['name:en']||p.class||'Точка на карте';const html='<div class="geo-head"><b>'+escapeHtml(n)+'</b><button class="geo-close" type="button" aria-label="Закрыть">×</button></div><div class="geo-grid"><div class="geo-metric"><small>Высота</small><strong>'+(height===null?'—':height.toFixed(1)+' м')+'</strong></div><div class="geo-metric"><small>Этажность</small><strong>'+(floors!==null?floors:estimate!==null?'≈ '+estimate:'—')+'</strong></div></div><p class="geo-note">'+fmt(e.lngLat.lat)+'° / '+fmt(e.lngLat.lng)+'°. '+(estimate!==null?'≈ — расчётная этажность по высоте, не подтверждённая данными. ':'')+'Фотографии ниже относятся к ближайшим точкам, не обязательно к выбранному зданию.</p><div id="photo-strip" class="photo-strip"></div>';const card=$('geo-card');card.innerHTML=html;card.hidden=false;card.querySelector('.geo-close').addEventListener('click',()=>card.hidden=true);void loadNearbyPhotos(e.lngLat.lat,e.lngLat.lng,++app.photoRequest)}
async function loadNearbyPhotos(lat,lon,token){const el=$('photo-strip');try{const qs=new URLSearchParams({action:'query',generator:'geosearch',ggscoord:lat+'|'+lon,ggsradius:'400',ggslimit:'8',ggsnamespace:'6',prop:'imageinfo',iiprop:'url',iiurlwidth:'160',format:'json',origin:'*'});const resp=await fetch('https://commons.wikimedia.org/w/api.php?'+qs,{signal:AbortSignal.timeout(8500)});if(!resp.ok)throw Error(resp.status);const data=await resp.json();if(token!==app.photoRequest)return;const photos=Object.values(data.query?.pages||{}).map(item=>({title:item.title?.replace(/^File:/,'')||'Фото',url:item.imageinfo?.[0]?.descriptionurl,img:item.imageinfo?.[0]?.thumburl})).filter(photo=>photo.url?.startsWith('https://')&&photo.img?.startsWith('https://'));if(!photos.length){el.innerHTML='<span class="geo-note">Фото рядом нет</span>';return}for(const photo of photos){const a=document.createElement('a');a.href=photo.url;a.target='_blank';a.rel='noopener noreferrer';const img=document.createElement('img');img.loading='lazy';img.alt=photo.title;img.src=photo.img;const label=document.createElement('span');label.textContent=photo.title.slice(0,22);a.append(img,label);el.append(a)}}catch(err){if(token===app.photoRequest)el.innerHTML='<span class="geo-note">Фотографии временно недоступны</span>'}}
async function readScenes(){try{const r=await fetch('./scenes.json',{cache:'no-cache'});if(!r.ok)throw Error('scenes.json '+r.status);const data=await r.json();app.scenes=(data.scenes||[]).filter(s=>s&&isSceneEnabled(s,{publicIonToken:ION_PUBLIC_TOKEN})&&typeof s.id==='string'&&Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)&&Math.abs(s.latitude)<=85&&Math.abs(s.longitude)<=180&&Number.isFinite(s.activationZoom)&&((s.type==='cesium-ion-khr'&&Number.isInteger(s.assetId))||(typeof s.url==='string'&&s.url.startsWith('https://')&&['khr-3dtiles','raw-splat','3dtiles-model','3dtiles-region'].includes(s.type))));console.info('Georeferenced 3D scene catalog:',app.scenes.length);const redmondButton=$('redmond-go');if(redmondButton)redmondButton.hidden=!app.scenes.some(s=>s.id==='redmond-campus-khr');drawScenePins();cameraMoved()}catch(err){console.warn('3D scene catalog is unavailable:',err);toast('Каталог Gaussian-сцен недоступен; геометрическая карта работает')}}
async function getCesium(){if(app.cesium)return app.cesium;if(window.Cesium){app.cesium=window.Cesium;if(ION_PUBLIC_TOKEN&&app.cesium.Ion)app.cesium.Ion.defaultAccessToken=ION_PUBLIC_TOKEN;return app.cesium}if(!window.__earthlensCesiumPromise){window.__earthlensCesiumPromise=new Promise((resolve,reject)=>{const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=CESIUM_CSS;document.head.append(stylesheet);const script=document.createElement('script');script.src=CESIUM_JS;script.async=true;script.onload=()=>window.Cesium?resolve(window.Cesium):reject(Error('Cesium global missing'));script.onerror=()=>reject(Error('Cesium script unavailable'));document.head.append(script)}).catch(e=>{window.__earthlensCesiumPromise=null;throw e})}app.cesium=await window.__earthlensCesiumPromise;if(ION_PUBLIC_TOKEN&&app.cesium.Ion)app.cesium.Ion.defaultAccessToken=ION_PUBLIC_TOKEN;return app.cesium}
function banner(scene,title,subtitle){$('splat-banner').hidden=false;$('scene-title').textContent=title;$('scene-description').textContent=subtitle||scene.name}
function cleanBanner(){$('splat-banner').hidden=true;$('app').classList.remove('loading-splat','in-splat')}
function deviceForLod(){
  return {
    width:window.innerWidth,
    memory:Number.isFinite(navigator.deviceMemory)?navigator.deviceMemory:8,
    saveData:navigator.connection?.saveData===true||navigator.connection?.effectiveType==='2g'
  };
}
function paintLodButtons(){
  for(const button of document.querySelectorAll('[data-lod]')){
    const on=button.dataset.lod===app.lodMode;
    button.classList.toggle('is-active',on);
    button.setAttribute('aria-pressed',String(on));
  }
  const sse=lodSSE(app.lodMode,deviceForLod());
  $('lod-sse').textContent="SSE "+sse+"px";
  return sse;
}
function showLodControls(tileset,scene,viewer){
  app.lodTileset=tileset;app.lodSource=scene;
  app.lodProgress={pending:0,processing:0};
  $('lod-controls').hidden=false;
  $('lod-debug').hidden=!new URLSearchParams(location.search).has('lodDebug');
  const sse=paintLodButtons();
  applyLod(tileset,app.lodMode,deviceForLod());
  $('lod-state').textContent=scene.type==='cesium-ion-khr'?'Cesium ion · 3DGS':'3D Tiles · потоковый LOD';
  tileset.loadProgress.addEventListener((pending,processing)=>{
    if(app.lodTileset!==tileset)return;
    app.lodProgress={pending,processing};
    $('lod-state').textContent=pending+processing>0
      ?'Плитки: '+pending+' запросов · '+processing+' обработка'
      :'LOD готов · SSE '+tileset.maximumScreenSpaceError+' px';
  });
  tileset.tileFailed.addEventListener(error=>{
    if(app.lodTileset!==tileset)return;
    console.warn("LOD tile failed:",error.message||error.url);
  });
  viewer.scene.requestRender();
  console.info('Cesium LOD attached',scene.id,'SSE',sse);
}
function hideLodControls(){
  app.lodTileset=null;app.lodSource=null;
  app.lodProgress={pending:0,processing:0};
  const controls=$('lod-controls');
  if(controls)controls.hidden=true;
  const button=$('lod-debug');
  if(button)button.setAttribute('aria-pressed','false');
}
function selectLod(mode){
  if(!isLodMode(mode))return;
  app.lodMode=mode;
  writeSetting('earthlens:lod',mode)
  const sse=paintLodButtons();
  if(app.lodTileset){
    applyLod(app.lodTileset,mode,deviceForLod());
    $('lod-state').textContent='LOD '+LOD_PRESETS[mode]+' · SSE '+sse+' px';
    app.viewer?.scene.requestRender();
  }
}

async function enterScene(scene){
  if(app.activeScene||app.sceneLoading||app.fallbackActive)return;
  app.sceneLoading=scene;
  const epoch=++app.sceneEpoch;
  const detailedModel=scene.type==='3dtiles-model'||scene.type==='3dtiles-region';
  const entering=app.map.getCenter();
  app.sceneEntry={center:[entering.lng,entering.lat],zoom:app.map.getZoom()};
  $('app').classList.add('loading-splat');
  banner(scene,detailedModel?'Загрузка PLATEAU 3D Tiles…':'Подключаем Gaussian Splatting…',
    detailedModel?'Реальные LOD2-модели города, местами с текстурами.':'Детальная фотографическая 3D-сцена с поточной загрузкой');
  try{
    if(['khr-3dtiles','cesium-ion-khr','3dtiles-model','3dtiles-region'].includes(scene.type))await loadKhrScene(scene,epoch);
    else if(scene.type==='raw-splat')await loadRawScene(scene,epoch);
  }catch(error){
    console.error('3D scene provider:',scene.id,error);
    if(epoch===app.sceneEpoch){
      app.failedScenes.set(scene.id,Date.now()+2*60*1000);
      toast('Источник '+scene.name+' недоступен; продолжаем показ реальных 3D-зданий OSM');
      cleanBanner();
    }
  }finally{
    if(app.sceneLoading?.id===scene.id)app.sceneLoading=null;
  }
}
async function loadKhrScene(scene,epoch){
  const C=await getCesium();
  if(epoch!==app.sceneEpoch)return;
  const stage=$('cesium-scene');
  stage.classList.add('warming');
  app.sceneVisibleTiles=0;
  let viewer=null;
  try{
    // OSM imagery gives orientation during asynchronous photogrammetric LOD streaming.
    const imagery=new C.ImageryLayer(new C.UrlTemplateImageryProvider({
      url:'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      maximumLevel:19,
      credit:new C.Credit('© OpenStreetMap contributors')
    }));
    viewer=new C.Viewer(stage,{
      animation:false,baseLayerPicker:false,baseLayer:imagery,
      terrain:CESIUM_WORLD_TERRAIN&&ION_PUBLIC_TOKEN&&scene.type==='cesium-ion-khr'&&C.Terrain?.fromWorldTerrain?C.Terrain.fromWorldTerrain():undefined,
      terrainProvider:new C.EllipsoidTerrainProvider(),
      fullscreenButton:false,vrButton:false,geocoder:false,homeButton:false,
      infoBox:false,navigationHelpButton:false,sceneModePicker:false,
      selectionIndicator:false,timeline:false,shadows:false,shouldAnimate:false
    });
    // OSM tiles remain a fallback if satellite imagery lacks coverage.
    // Actual 3D Tiles keep their own photographic mesh textures.
    if(restoredImagery())try{
      const provider=new C.UrlTemplateImageryProvider({
        url:WORLD_IMAGERY_TILE_URL,maximumLevel:18,
        credit:new C.Credit(WORLD_IMAGERY_ATTRIBUTION),
        enablePickFeatures:false
      });
      viewer.imageryLayers.addImageryProvider(provider);
    }catch(error){console.warn('Cesium satellite imagery unavailable:',error)}
    const request=scene.type==='cesium-ion-khr'
      ? C.Cesium3DTileset.fromIonAssetId(scene.assetId)
      : C.Cesium3DTileset.fromUrl(scene.url);
    const tileset=await Promise.race([
      request,new Promise((_,reject)=>setTimeout(()=>reject(new Error('3D Tiles service timeout')),22000))
    ]);
    if(epoch!==app.sceneEpoch){viewer.destroy();return}
    viewer.scene.primitives.add(tileset);
    tileset.maximumScreenSpaceError=lodSSE(app.lodMode,deviceForLod());
    if(scene.orthoUrl){
      // PLATEAU orthophotography complements actual 3D city meshes.
      // OSM remains the underlying imagery if the imagery service lacks coverage.
      try{
        const ortho=new C.UrlTemplateImageryProvider({
          url:scene.orthoUrl,maximumLevel:19,
          credit:new C.Credit(scene.orthoAttribution||'© Project PLATEAU / MLIT Japan')
        });
        viewer.imageryLayers.addImageryProvider(ortho);
      }catch(error){console.warn('Optional PLATEAU orthophotography not available:',error)}
    }
    const isCity=scene.type==='3dtiles-model'||scene.type==='3dtiles-region';
    // Country-wide tilesets have huge bounding spheres. Zoom to the current
    // neighborhood instead; otherwise Cesium would zoom to the entire country.
    const focus=app.sceneEntry?.center||[scene.longitude,scene.latitude];
    viewer.camera.setView({
      destination:C.Cartesian3.fromDegrees(
        isCity?focus[0]:scene.longitude,isCity?focus[1]:scene.latitude,
        scene.cameraHeightMeters||(isCity?550:190)
      ),
      orientation:{
        heading:C.Math.toRadians(scene.type==='cesium-ion-khr'?scene.cameraHeadingDegrees??100:isCity?0:345),
        pitch:C.Math.toRadians(scene.type==='cesium-ion-khr'?scene.cameraPitchDegrees??-25:isCity?-73:-55),roll:0
      }
    });
    // Preserve the published tutorial camera for Redmond instead of overriding
    // it with an unrelated bounding-sphere fly-to.
    if(!isCity&&scene.type!=='cesium-ion-khr'){
      try{await viewer.zoomTo(tileset,new C.HeadingPitchRange(
        C.Math.toRadians(scene.cameraHeadingDegrees??0),C.Math.toRadians(scene.cameraPitchDegrees??-32),scene.cameraRangeMeters??80
      ))}catch(error){console.warn('Zoom to Gaussian scene:',error)}
    }
    if(epoch!==app.sceneEpoch){viewer.destroy();return}
    // Keep the established OSM 3D map visible until the first actual 3D Tiles
    // content is visible in Cesium. Tileset metadata alone is not a rendered scene.
    await new Promise((resolve,reject)=>{
      let settled=false,unsubscribe=()=>{};
      const timeout=setTimeout(()=>{
        if(settled)return;
        settled=true;unsubscribe();
        reject(new Error('No real 3D Tiles content became visible within 27 seconds'));
      },27000);
      unsubscribe=tileset.tileVisible.addEventListener(tile=>{
        if(settled||!tile?.content||tile.content.ready===false)return;
        settled=true;clearTimeout(timeout);unsubscribe();
        app.sceneVisibleTiles=1;
        resolve();
      });
      viewer.scene.requestRender();
    });
    // A tileVisible event precedes GPU splat sorting/texture readiness. Do not
    // reveal Cesium over the working 3D map until the renderer has settled.
    await new Promise(resolve=>setTimeout(resolve,
      scene.type==='khr-3dtiles'?5200:3200));
    if(epoch!==app.sceneEpoch){viewer.destroy();return}
    stage.classList.remove('warming');
    stage.classList.add('active');stage.setAttribute('aria-hidden','false');
    app.viewer=viewer;app.activeScene=scene;
    $('app').classList.remove('loading-splat');$('app').classList.add('in-splat');$('geo-card').hidden=true;
    showLodControls(tileset,scene,viewer);
    banner(scene,isCity?'PLATEAU 3D CITY · LIVE':'KHR Gaussian Splatting · LIVE',
      scene.name+(isCity?' · реальные городские 3D Tiles':' · Gaussian Splats LOD'));
    setMode(isCity?'3D CITY MODEL':'KHR 3DGS',isCity?'JAPAN PLATEAU · LOD 2':'KHR_gaussian_splatting · LOD');
    // A detail tileset is not proof of loaded geometry. Report streaming separately.
    let loaded=0;
    tileset.tileLoad.addEventListener(()=>{
      if(app.activeScene?.id!==scene.id)return;
      loaded++;
      if(loaded===1)$('scene-description').textContent=scene.name+' · высокодетальные плитки подгружаются';
    });
    viewer.camera.moveEnd.addEventListener(()=>{
      if(app.activeScene?.id!==scene.id)return;
      const height=viewer.camera.positionCartographic?.height||0;
      if(height>scene.returnHeightMeters)exitScene();
    });
    toast('Детальный 3D-слой подключён: '+scene.name);
  }catch(error){
    if(viewer&&!viewer.isDestroyed())viewer.destroy();
    hideLodControls();
    stage.classList.remove('active','warming');stage.setAttribute('aria-hidden','true');
    throw error;
  }finally{stage.classList.remove('warming')}
}
async function loadRawScene(scene,epoch){const lib=await import('https://esm.sh/maplibre-gl-splat@0.2.9?deps=maplibre-gl@6.14.0,three@0.186.1');if(epoch!==app.sceneEpoch)return;const Control=lib.GaussianSplatControl;if(typeof Control!=='function')throw Error('GaussianSplatControl unavailable');if(!app.splatControl){app.splatControl=new Control({collapsed:true,flyTo:false});app.map.addControl(app.splatControl,'top-right')}const layerId=await app.splatControl.loadSplat(scene.url,{longitude:scene.longitude,latitude:scene.latitude,altitude:scene.altitude||0,rotation:scene.rotation||[0,0,0],scale:scene.scale||1});if(epoch!==app.sceneEpoch){app.splatControl.removeSplat(layerId);return}app.splatIds.add(layerId);app.activeScene=scene;$('app').classList.remove('loading-splat');$('geo-card').hidden=true;banner(scene,'Gaussian Splatting · LIVE',scene.name);setMode('RAW 3DGS','SPATIAL GAUSSIAN SPLATS');toast('Геопривязанный Gaussian Splat загружен автоматически')}
function exitScene(){
  app.sceneEpoch++;
  const current=app.activeScene;
  const returnTo=app.sceneEntry;
  app.activeScene=null;app.sceneLoading=null;app.sceneEntry=null;
  // Do not immediately reload the scene on returning to the map.
  app.sceneCooldownUntil=Date.now()+30000;
  const stage=$('cesium-scene');
  stage.classList.remove('active');stage.setAttribute('aria-hidden','true');
  if(app.viewer){
    const viewer=app.viewer;app.viewer=null;
    setTimeout(()=>{try{if(!viewer.isDestroyed())viewer.destroy()}catch{}},650);
  }
  if(app.splatControl){
    for(const id of app.splatIds)try{app.splatControl.removeSplat(id)}catch{}
    app.splatIds.clear();
  }
  cleanBanner();
  hideLodControls();
  setMode('OSM 3D','ОБЪЁМНЫЕ ЗДАНИЯ');
  if(current&&returnTo){
    app.map.jumpTo({center:returnTo.center,zoom:Math.max(12,returnTo.zoom-1.15),pitch:63});
    toast('Вернулись к общей 3D-карте');
  }
  updateGuidance();
}
function setTilt(){if(app.fallbackActive){toast('Резервная 2D-карта: для 3D необходим WebGL и векторный источник');return}app.userCamera3d=!app.userCamera3d;$('tilt').classList.toggle('active',app.userCamera3d);app.map.easeTo({pitch:app.userCamera3d?62:0,bearing:app.userCamera3d?-15:0,duration:650})}

function cycleStyle(){
 if(app.fallbackActive){toast('Работает резервный растровый слой OpenStreetMap');return}
 app.styleIndex=(app.styleIndex+1)%BASE_STYLES.length;
 const next=BASE_STYLES[app.styleIndex];
 app.tileErrors=0;
 app.stream?.start('Переключаем картографический стиль…');
 // Prefer an incremental style diff; preserve native 3D/imagery/weather layers.
 app.map.setStyle(next.url,{diff:true,transformStyle:preserveEarthLensOverlays});
 $('layers-label').textContent='OPENFREEMAP · '+next.name.toUpperCase();
 toast('Картографический слой: '+next.name);
}
function showMapRecovery(message){
 $('loading-text').textContent=message;
 $('loading').classList.remove('hidden');
 $('map-retry').hidden=false;
}
function onMapReady(){
 if(app.mapReady)return;
 app.mapReady=true;clearTimeout(app.bootTimer);
 $('loading').classList.add('hidden');
 $('map-retry').hidden=true;
 app.stream?.end();
 styleLoaded();showPosition();updateGuidance();initExploreLayers({map:app.map,maplibre:maplibregl});
 if(!app.sceneDataLoaded){app.sceneDataLoaded=true;void readScenes()}
}
// If the CDN/worker/style/WebGL fails, never leave the viewer behind a blocking loader.
// Leaflet is locally bundled. Public OSM raster tiles are a *limited-use fallback*.
async function activateRasterFallback(reason){
 if(app.fallbackActive||app.fallbackStarting)return;
 app.fallbackStarting=true;
 clearTimeout(app.bootTimer);
 console.warn('MapLibre fallback:',reason);
 app.stopProgress?.();app.stream?.start('Резервные тайлы OpenStreetMap…');
 $('loading-text').textContent='ВКЛЮЧАЕМ РЕЗЕРВНЫЙ СЛОЙ КАРТЫ';
 const center=app.map?.getCenter?.()||{lat:defaultView.center[1],lng:defaultView.center[0]};
 const zoom=app.map?.getZoom?.()||defaultView.zoom;
 let L;
 try{L=await import('leaflet')}catch(err){
   console.error('Leaflet import failed:',err);
   showMapRecovery('Карта недоступна. Проверьте интернет и повторите загрузку.');
   app.fallbackStarting=false;return;
 }
 app.satelliteRoofs?.destroy();app.satelliteRoofs=null;
 try{app.map?.remove?.()}catch(err){console.warn('Map cleanup',err)}
 $('map').replaceChildren();
 const raster=L.map('map',{zoomControl:false,attributionControl:true,minZoom:2,maxZoom:19,worldCopyJump:true,preferCanvas:true});
 raster.setView([center.lat,center.lng],clamp(zoom,2,19),{animate:false});
 let tileCount=0,tileErrors=0;
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
   maxZoom:19,maxNativeZoom:19,crossOrigin:true,updateWhenIdle:true,keepBuffer:window.innerWidth<650?2:4
 }).addTo(raster);
 tiles.on('tileload',()=>{tileCount++;if(tileCount>=4){$('loading').classList.add('hidden');$('map-retry').hidden=true}});
 tiles.on('loading',()=>app.stream?.start('Загружаем резервные тайлы…'));
 tiles.on('load',()=>{if(tileCount>0){$('loading').classList.add('hidden');$('map-retry').hidden=true}app.stream?.end()});
 tiles.on('tileerror',()=>{tileErrors++;if(tileErrors>=6&&tileCount===0){
   showMapRecovery('Сервер карт недоступен. Повторите попытку или переключитесь на другую сеть.');
 }});
 L.control.zoom({position:'topright'}).addTo(raster);
 app.fallbackActive=true;app.fallbackStarting=false;
 app.leaflet=raster;app.leafletLib=L;
 // Preserve map-level interactions and the georeferenced scene catalog.
 app.map={
   getCenter:()=>raster.getCenter(),getZoom:()=>raster.getZoom(),
   getPitch:()=>0,getBearing:()=>0,
   flyTo:({center,zoom:z})=>raster.flyTo([center[1],center[0]],clamp(z||raster.getZoom(),2,19),{duration:1.2}),
   jumpTo:({center,zoom:z})=>raster.setView([center[1],center[0]],clamp(z||raster.getZoom(),2,19),{animate:false}),
   easeTo:()=>{},
   queryRenderedFeatures:()=>[],
 };
 raster.on('moveend',cameraMoved);
 raster.on('click',e=>showExploreAt(e.latlng.lat,e.latlng.lng,'Точка на карте'));
 $('tilt').textContent='2.5D';
 $('layers-label').textContent='OSM + OPENFREEMAP · 2.5D';
 $('guidance').textContent='Приближайте карту: здания поднимаются объёмными блоками даже без WebGL. Фотографические сканы требуют WebGL.';
 setMode('CANVAS 2.5D','OSM · ОБЪЁМНЫЕ ЗДАНИЯ');
 // OpenFreeMap vector tiles are decoded into shaded building volumes on Canvas2D.
 try{
   app.canvasBuildings=attachCanvasBuildingLayer(raster,{
     onData:count=>{if(count>0&&app.fallbackActive){app.renderedBuildings=count;$('quality-label').textContent='CANVAS · '+count+' ЗДАНИЙ';}}
   });
 }catch(error){console.warn('Canvas building extrusion unavailable:',error);}
 showPosition();storeCamera();
 drawScenePins();
 updateExploreMap({map:app.map,fallback:true,leaflet:raster,L});
 if(!app.sceneDataLoaded){app.sceneDataLoaded=true;void readScenes()}
 // Wait for an actual raster tile before removing the loading screen.
 setTimeout(()=>{if(tileCount===0&&tileErrors===0){
   $('loading-text').textContent='Резервная карта загружается медленно…';
 }},9000);
}
function supportsWebGL2(){
  // MapLibre GL JS v6 does NOT export supported(). Test the graphics API directly.
  // Browsers may expose the API while disabling rendering in GPU settings.
  try{
    const probe=document.createElement('canvas');
    const context=probe.getContext('webgl2',{failIfMajorPerformanceCaveat:false});
    const ok=!!context&&context.getSupportedExtensions()!==null;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  }catch(error){console.warn('WebGL2 probe:',error);return false}
}
function boot(){
 app.stream=createMapProgress($('app'));
 $('map-retry').addEventListener('click',()=>window.location.reload());
 app.placesHub=mountSavedPlaces({
  root:$('app'),toolbar:document.querySelector('.corner-toolbar'),
  getView:()=>{
   if(!app.map)return null;
   const center=app.map.getCenter();
   return {lat:center.lat,lng:center.lng,zoom:app.map.getZoom(),
    pitch:app.map.getPitch?.()??0,bearing:app.map.getBearing?.()??0};
  },
  onNavigate:place=>{
   if(app.activeScene)exitScene();
   $('geo-card').hidden=true;
   const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
   app.map?.flyTo({center:[place.lng,place.lat],zoom:place.zoom,
    pitch:app.fallbackActive?0:place.pitch,
    bearing:app.fallbackActive?0:place.bearing,duration:reduced?0:1200});
  },
  notify:toast
 });
 app.helpHub=mountProductHelp({
  root:$('app'),toolbar:document.querySelector('.corner-toolbar'),
  version:APP_VERSION
 });
 const buildVersion=$('build-version');
 if(buildVersion){buildVersion.textContent='v'+APP_VERSION;buildVersion.title='Версия EarthLens 3D '+APP_VERSION}
 document.querySelectorAll('[data-lod]').forEach(button=>button.addEventListener('click',()=>selectLod(button.dataset.lod)));
 $('lod-debug').addEventListener('click',()=>{if(!app.lodTileset)return;app.lodDebug=!app.lodDebug;app.lodTileset.debugShowBoundingVolume=app.lodDebug;$('lod-debug').setAttribute('aria-pressed',String(app.lodDebug));app.viewer?.scene.requestRender()});
 paintLodButtons();
 $('focus-dismiss').addEventListener('click',()=>$('app').classList.add('focus-dismissed'));
 document.querySelectorAll('.city-go').forEach(button=>{
   button.addEventListener('click',()=>{
     let lon=Number(button.dataset.lon),lat=Number(button.dataset.lat),zoom=Number(button.dataset.zoom);
     if(button.dataset.scene){
       const scene=app.scenes.find(s=>s.id===button.dataset.scene);
       if(!scene){toast('Каталог 3D-сцен ещё подключается');return}
       lon=scene.longitude;lat=scene.latitude;zoom=scene.activationZoom+0.3;
       toast('Приближаем настоящую Gaussian Splat-сцену: '+scene.name);
     }
     if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(zoom))return;
     if(app.activeScene)exitScene();
     // Explicit navigation bypasses automatic 30-second scene exit cooldown.
     if(button.dataset.scene){app.sceneCooldownUntil=0;app.failedScenes.delete(button.dataset.scene)}
     $('geo-card').hidden=true;
     app.map.flyTo({center:[lon,lat],zoom,pitch:66,bearing:-26,duration:2100});
   });
 });
 app.geosearch=attachPlaceSearch({
  form:$('place-search'),input:$('search-text'),box:$('search-results'),
  onSelect:place=>{
   if(app.activeScene)exitScene();
   $('geo-card').hidden=true;
   const selectedPlace={title:place.shortName,lat:place.lat,lon:place.lng};
   const keepSelected=()=>app.placesHub?.select(selectedPlace);
   // Update immediately, then again after fly-to completes. On a slow/mobile
   // animation the bookmark panel can open before the terminal moveend event.
   keepSelected();
   // Fly-to dispatches the global moveend event, which clears any previous
   // selection. Restore the searched place label AFTER the destination lands.
   if(app.fallbackActive&&app.leaflet?.once)app.leaflet.once('moveend',keepSelected);
   else if(app.map?.once)app.map.once('moveend',keepSelected);
   else keepSelected();
   const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
   app.map?.flyTo({
    center:[place.lng,place.lat],zoom:place.zoom,
    pitch:app.fallbackActive?0:place.zoom>=13?60:25,
    bearing:app.fallbackActive?0:-12,duration:reduced?0:1400
   });
  }
 });
 $('sample-fly').addEventListener('click',sampleFly);
 $('tilt').addEventListener('click',setTilt);
 $('style-cycle').addEventListener('click',cycleStyle);
 $('reset-view').addEventListener('click',()=>{if(app.fallbackActive)return;app.map.easeTo({bearing:0,duration:500})});
 $('share').addEventListener('click',async()=>{storeCamera();try{await navigator.clipboard.writeText(location.href);toast('Ссылка на ракурс скопирована')}catch{toast('Адрес: '+location.href)}});
 $('exit-splat').addEventListener('click',exitScene);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&app.activeScene)exitScene();
  if(event.key==='/'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!document.getElementById('earthlens-help')?.open){
   if(event.target?.closest?.('input,textarea,[contenteditable="true"]'))return;
   event.preventDefault();$('search-text').focus();
  }
 });
 window.addEventListener('hashchange',()=>{if(app.activeScene||!app.map)return;app.map.jumpTo(parseHash())});
 // The recovery timer is armed before any external style request is made.
 app.bootTimer=setTimeout(()=>{if(!app.mapReady)void activateRasterFallback('Map style did not become ready within 12 seconds')},12000);
 if(!supportsWebGL2()){void activateRasterFallback('WebGL2 unavailable');return}
 try{
   // Cap framebuffer resolution on high-DPR/mobile graphics hardware while retaining
   // recently viewed tiles. This avoids unnecessary full redraws during navigation.
   const compact=window.matchMedia('(max-width: 700px)').matches||(navigator.deviceMemory||8)<=4;
   const pixelRatio=Math.max(1,Math.min(compact?1.6:2,window.devicePixelRatio||1));
   const map=new maplibregl.Map({
    container:'map',style:MAP_STYLE,...parseHash(),maxPitch:85,
    pixelRatio,maxTileCacheZoomLevels:compact?3:7,fadeDuration:compact?460:720,
    canvasContextAttributes:{antialias:!compact,preserveDrawingBuffer:false},
    attributionControl:false,hash:false
   });
   app.map=map;
   app.satelliteRoofs=createSatelliteRoofProjection(map,{
    getQuality:getExploreQuality,
    onStatus:detail=>window.dispatchEvent(new CustomEvent('earthlens:roof-status',{detail}))
   });
   window.addEventListener('earthlens:satellite-changed',event=>app.satelliteRoofs?.setEnabled(event.detail?.enabled));
   window.addEventListener('earthlens:roof-retry',()=>app.satelliteRoofs?.retry());
   window.addEventListener('earthlens:quality-changed',()=>app.satelliteRoofs?.ensure());
   app.stopProgress=watchMapTiles(map,app.stream);
   map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
   if(typeof maplibregl.GlobeControl==='function')map.addControl(new maplibregl.GlobeControl(),'top-right');
   map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
   map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
   map.on('load',onMapReady);
   map.on('idle',updateBuildingStatistics);
   map.on('style.load',()=>{if(!app.fallbackActive)styleLoaded()});
   map.on('move',showPosition);
   map.on('moveend',cameraMoved);
   map.on('click',e=>{const p=e.lngLat;let f;try{f=map.queryRenderedFeatures(e.point,{layers:['earthlens-3d-buildings']})[0]}catch{}showExploreAt(p.lat,p.lng,f?.properties?.name||'Точка на карте',f?.properties||{})});
   map.on('error',e=>{
     const msg=e.error?.message||String(e.error||'unknown');
     console.warn('Map data source:',msg);
     if(!app.mapReady){
       app.tileErrors++;
       if(app.tileErrors>=8)void activateRasterFallback('Map resources repeatedly failed: '+msg.slice(0,120));
     }
   });
 }catch(err){console.error('MapLibre init:',err);void activateRasterFallback(err.message||'WebGL map initialization failed')}
}
// Inspectable, read-only diagnostics used by real Chromium rendering tests.
window.__earthlensDiagnostics=()=>({engine:app.fallbackActive?'canvas-2.5d':app.mapReady?'webgl-3d':'initializing',buildings:app.renderedBuildings,zoom:app.map?.getZoom?.()??null,sceneCount:app.scenes.length,activeScene:app.activeScene?.id||null,sceneVisibleTiles:app.sceneVisibleTiles,lodMode:app.lodMode,lodSSE:app.lodTileset?.maximumScreenSpaceError??null,lonTokenConfigured:ION_PUBLIC_TOKEN.length>0,globe:app.globeActive,satelliteRoofs:app.satelliteRoofs?.stats()||null,weatherWindLayer:Boolean(app.map?.getLayer?.('earthlens-weather-wind-vectors')),version:APP_VERSION,savedPlaces:app.placesHub?.store.count??0});
try{boot()}catch(err){console.error(err);void activateRasterFallback(err.message||'Unexpected map bootstrap failure')}
