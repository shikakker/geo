import {loadGeoPhotos,PHOTO_PROXIMITY_NOTICE} from './photo-sources.js';
import {getWeatherForView,temperatureColor,WEATHER_HORIZONS,resetWeatherCache} from './weather-layer.js';
import {createTTLCache,featureKey,tileKey,withinMarkers} from './layer-runtime.js';
import {GEO_ADDONS} from './geo-addons.js';
import {GEO_ADDONS_NEXT} from './geo-addons-next.js';
import {GEO_ADDONS_VISUAL} from './geo-addons-visual.js';
import {createWindGeoJSON} from './weather-wind.js';
import {nearestMappedFeature} from './places-nearby.js';
import {attachGeoCatalog} from './geo-library-ui.js';
import {solarPosition} from './solar-position.js';
import {createFrameQueue} from './progressive-render.js';
import {warmSpatialAcceleration,visibleByDistance,createCandidateCache} from './spatial-acceleration.js';
import {createAdaptiveQuality,beginMoveFpsSampling} from './adaptive-quality.js';
import {restoredLayers,storeLayers,restoredQuality,storeQuality,restoredImagery,storeImagery} from './layer-preferences.js';
const THEMES=[
 {id:'addresses',name:'Адреса',symbol:'⌂',on:true},
 {id:'trees',name:'Деревья и природа',symbol:'♣',on:true},
 {id:'cameras',name:'Камеры · Финляндия',symbol:'▣',on:false},
 {id:'transport',name:'Остановки автобусов',symbol:'▰',on:false},
 {id:'traffic',name:'Светофоры',symbol:'◉',on:false},
 {id:'realty',name:'Здания и аренда',symbol:'⌗',on:false},
 {id:'weather',name:'Погода',symbol:'☀',on:false}
];
const LIBRARIES=[
 ['@turf/turf','https://github.com/Turfjs/turf','Геоанализ и расстояния'],
 ['supercluster','https://github.com/mapbox/supercluster','Кластеры точек'],
 ['rbush','https://github.com/mourner/rbush','Пространственный индекс'],
 ['geojson-vt','https://github.com/mapbox/geojson-vt','Векторизация больших наборов'],
 ['vt-pbf','https://github.com/mapbox/vt-pbf','Экспорт векторных тайлов'],
 ['martinez-polygon-clipping','https://github.com/w8r/martinez','Пересечения полигонов'],
 ['earcut','https://github.com/mapbox/earcut','Триангуляция объектов'],
 ['three','https://github.com/mrdoob/three.js','3D геометрия растительности'],
 ['osmtogeojson','https://github.com/tyrasd/osmtogeojson','OSM → GeoJSON'],
 ['PMTiles','https://github.com/protomaps/PMTiles','Самостоятельный хостинг тайлов']
];
const el=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const bound=(x,min,max)=>Math.min(max,Math.max(min,x));
const isCoord=x=>Number.isFinite(x)&&Math.abs(x)<=180;
const cache=new Map();
const canopyPolygon=(lon,lat,radiusMeters)=>{const latScale=radiusMeters/111320,lonScale=latScale/Math.max(.2,Math.cos(lat*Math.PI/180));const ring=[];for(let i=0;i<=10;i++){const a=i*Math.PI/5;ring.push([lon+Math.cos(a)*lonScale,lat+Math.sin(a)*latScale])}return [ring]};
const state={map:null,fallback:false,leaflet:null,L:null,markers:[],markerIndex:new Map(),exitingMarkers:new Map(),drawRaf:null,candidates:createCandidateCache(),frameQueue:createFrameQueue(),controller:null,selectEpoch:0,windEpoch:0,quality:'smooth',qualityPreference:'auto',qualityController:null,stopFpsSampling:null,selectedFeature:null,photoController:null,seq:0,lastBounds:'',timer:null,active:new Set(restoredLayers(THEMES.map(t=>t.id),THEMES.filter(t=>t.on).map(t=>t.id))),features:[],cameraFeatures:[],weatherFeatures:[],weatherOffsetHours:0,osmCache:createTTLCache({limit:28,ttlMs:240000}),osmStatus:'idle',cameraStatus:'idle',lastManualRetry:0,base:'satellite',imagery:restoredImagery(),weatherError:false,lastTreeSource:null,lastTreeEnabled:null,treeIndex:null,treeEpoch:0,treePending:null};
const providers=[
 {id:'airbnb',name:'Airbnb',url:(lat,lon)=>'https://www.airbnb.com/s/'+lat+','+lon+'/homes'},
 {id:'booking',name:'Booking',url:(lat,lon)=>'https://www.booking.com/searchresults.html?ss='+encodeURIComponent(lat+','+lon)},
 {id:'google',name:'Google Travel',url:(lat,lon)=>'https://www.google.com/travel/search?q='+encodeURIComponent(lat+','+lon+' stays')},
 {id:'yandex',name:'Яндекс Недвижимость',url:(lat,lon)=>'https://realty.yandex.ru/?text='+encodeURIComponent(lat+','+lon)}
];
function apiPopup(title,details='',photo=null){
 state.photoController?.abort();
 const panel=el('explore-detail');panel.hidden=false;
 panel.replaceChildren();
 const head=document.createElement('div');head.className='explore-detail-head';
 const heading=document.createElement('strong');heading.textContent=title;
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Закрыть карточку');close.addEventListener('click',()=>{state.selectEpoch++;state.selectedFeature=null;panel.hidden=true;state.photoController?.abort()});
 head.append(heading,close);panel.append(head);
 const p=document.createElement('p');p.className='explore-sub';p.textContent=details;panel.append(p);
 if(photo){const img=document.createElement('img');img.className='explore-camera-image';img.src=photo;img.alt=title;img.referrerPolicy='no-referrer';img.loading='lazy';panel.append(img)}
}
function weatherDescription(props){
 const horizon=props.horizonHours?'прогноз +'+props.horizonHours+' ч':'текущие условия';
 const sample=props.approximate
  ?' · расчёт модели для '+Number(props.sampleLat).toFixed(3)+'°, '+Number(props.sampleLon).toFixed(3)+'° (рядом с маркером)':'';
 const time=props.updated?' · '+props.updated+' UTC':'';
 return 'Модель Open-Meteo · '+horizon+' · не измерение на месте'+sample+time;
}
function openDetail(feature){
 state.selectEpoch++;state.selectedFeature=feature;
 const p=feature.properties||{},coordinates=feature.geometry?.coordinates||[];
 const lat=coordinates[1],lon=coordinates[0];
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 const label=p.name||p['addr:street']||p.description||'Место на карте';
 const title=p['addr:housenumber']&&p['addr:street']?p['addr:street']+', '+p['addr:housenumber']:label;
 const kind=p._kind||'Место';
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('earthlens:place-selected',{
  detail:{title,lat,lon}
 }));
 if(kind==='weather'){
   apiPopup('Погода · '+Number(lat).toFixed(3)+'°, '+Number(lon).toFixed(3)+'°', weatherDescription(p));
   const details=document.createElement('div');details.className='explore-weather-grid';
   const metrics=[['Температура',p.temperature,'°C'],['Ощущается',p.feels,'°C'],['Ветер',p.wind,'км/ч'],['Направление ветра',p.windDirection,'° от севера'],['Осадки',p.precipitation,'мм'],['Облачность',p.clouds,'%'],['Влажность',p.humidity,'%'],['Давление',p.pressure,'гПа']];
   metrics.forEach(([key,value,unit])=>{if(value===null||value===undefined)return;const cell=document.createElement('div');cell.className='explore-weather-cell';const k=document.createElement('small');k.textContent=key;const v=document.createElement('b');v.textContent=String(Math.round(Number(value)*10)/10)+' '+unit;cell.append(k,v);details.append(cell)});
   el('explore-detail').append(details);
   const windInfo=document.createElement('p');windInfo.className='explore-sub';windInfo.textContent='Линии ветра показывают направление, а не реальную траекторию перемещения воздуха.';el('explore-detail').append(windInfo);
   const credit=document.createElement('a');credit.className='explore-weather-credit';credit.href='https://open-meteo.com/';credit.target='_blank';credit.rel='noopener noreferrer';credit.textContent='Данные и условия © Open-Meteo ↗';el('explore-detail').append(credit);
   const solar=document.createElement('p');solar.className='explore-sub';solar.textContent='Рассчитываем положение Солнца…';
   el('explore-detail').append(solar);
   void solarPosition({lat,lon}).then(value=>{
    if(!value||el('explore-detail').hidden||!solar.isConnected)return;
    solar.textContent='☀ Солнце сейчас: '+value.altitude+'° над горизонтом · азимут '+value.azimuth+'° · расчёт SunCalc';
   }).catch(()=>{if(solar.isConnected)solar.remove()});
   return;
 }
 const note=kind==='cameras'?'Дорожная камера · снимок обновляется поставщиком; это не live-видео':kind==='traffic'?'Координаты дорожного объекта из OpenStreetMap':'Данные OpenStreetMap, точность и полнота зависят от региона';
 apiPopup(title,note);
 const panel=el('explore-detail');
 if(kind==='cameras'){
   const image=p._image;
   if(image&&image.startsWith('https://')){const im=document.createElement('img');im.className='explore-camera-image';im.src=image;im.alt='Снимок дорожной камеры';im.loading='lazy';panel.append(im)}
 }
 if(kind==='realty'){
   const links=document.createElement('div');links.className='explore-link-row';
   providers.forEach(item=>{const a=document.createElement('a');a.href=item.url(lat,lon);a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.name+' ↗';links.append(a)});panel.append(links);
   const disclaimer=document.createElement('p');disclaimer.className='explore-sub';disclaimer.textContent='Это переход к поиску на внешних площадках. Объявления и цены не импортируются без официальных API.';panel.append(disclaimer);
 }
 const labelTitle=kind==='cameras'?'Фото местности рядом с камерой':'Фотографии поблизости';
 const subtitle=document.createElement('div');subtitle.className='explore-photo-title';subtitle.textContent=labelTitle;panel.append(subtitle);
 const notice=document.createElement('p');notice.className='explore-sub';notice.textContent=PHOTO_PROXIMITY_NOTICE;panel.append(notice);
 const photos=document.createElement('div');photos.className='explore-gallery';photos.textContent='Поиск фото…';panel.append(photos);
 state.photoController?.abort();const ctl=new AbortController();state.photoController=ctl;
 let displayed=0;
 loadGeoPhotos({lat,lon,label:label.toString(),tags:p,signal:ctl.signal,onBatch(batch){
  if(ctl.signal.aborted)return;
  if(!displayed)photos.replaceChildren();
  for(const picture of batch){
   const a=document.createElement('a');a.href=picture.url;a.target='_blank';a.rel='noopener noreferrer';a.title=picture.provider+' · '+picture.license;
   const img=document.createElement('img');img.loading='lazy';img.alt=picture.title;img.referrerPolicy='no-referrer';
   img.className='explore-photo-progress';img.decoding='async';
   img.addEventListener('load',()=>img.classList.add('is-loaded'),{once:true});
   img.addEventListener('error',()=>{img.classList.add('is-unavailable');img.alt='Превью недоступно — открыть источник';},{once:true});
   img.src=picture.img;
   const s=document.createElement('span');s.textContent=picture.provider;
   a.append(img,s);photos.append(a);displayed++;if(displayed>=30)break;
  }
 }}).then(()=>{if(!ctl.signal.aborted&&!displayed)photos.textContent='Подтверждённых изображений рядом нет или сервисы недоступны'}).catch(()=>{if(!ctl.signal.aborted)photos.textContent='Фото временно недоступны'});
}
// A forecast time change updates the already open weather card in place;
// do not require a second marker click (which can be covered by the mobile sheet).
function updateWeatherCard(feature){
 const panel=el('explore-detail');
 if(!panel||panel.hidden||state.selectedFeature?.properties?._kind!=='weather'||!feature)return;
 const p=feature.properties;
 state.selectedFeature=feature;
 const heading=panel.querySelector('.explore-detail-head strong');
 if(heading)heading.textContent='Погода · '+feature.geometry.coordinates[1].toFixed(3)+'°, '+feature.geometry.coordinates[0].toFixed(3)+'°';
 const subtitle=panel.querySelector('.explore-sub');
 if(subtitle)subtitle.textContent=weatherDescription(p);
 const values={
  'Температура':[p.temperature,'°C'],'Ощущается':[p.feels,'°C'],'Ветер':[p.wind,'км/ч'],
  'Направление ветра':[p.windDirection,'° от севера'],'Осадки':[p.precipitation,'мм'],
  'Облачность':[p.clouds,'%'],'Влажность':[p.humidity,'%'],'Давление':[p.pressure,'гПа']
 };
 for(const cell of panel.querySelectorAll('.explore-weather-cell')){
  const key=cell.querySelector('small')?.textContent||'';
  const [value,unit]=values[key]||[null,''];
  cell.hidden=value===null||value===undefined||!Number.isFinite(Number(value));
  if(!cell.hidden){const number=cell.querySelector('b');if(number)number.textContent=String(Math.round(Number(value)*10)/10)+' '+unit}
 }
}
function categoryFor(tags){
 if(tags.highway==='traffic_signals')return'traffic';
 if(tags.highway==='bus_stop'||tags.public_transport==='platform'||tags.amenity==='bus_station')return'transport';
 if(tags.natural==='tree'||tags.natural==='tree_row'||tags.natural==='wood'||tags.landuse==='forest'||tags.leisure==='park')return'trees';
 if(tags['addr:housenumber']||tags['addr:street'])return'addresses';
 if(tags.building)return'realty';
 return null;
}
function toFeature(item){
 const lat=item.lat??item.center?.lat,lon=item.lon??item.center?.lon;
 if(!Number.isFinite(lat)||!isCoord(lon)||Math.abs(lat)>85)return null;
 const tags=item.tags||{},kind=categoryFor(tags);
 if(!kind)return null;
 return {type:'Feature',id:item.type+'/'+item.id,geometry:{type:'Point',coordinates:[lon,lat]},properties:{...tags,_kind:kind,name:tags.name||tags['addr:street']||({'trees':'Дерево / зелёная зона','transport':'Остановка','traffic':'Светофор','addresses':'Адрес','realty':'Здание'}[kind])}};
}
async function cameras(){
 if(!state.active.has('cameras'))return [];
 const cached=cache.get('fi-cameras');
 if(cached&&Date.now()-cached.at<10*60*1000){
  state.cameraStatus=cached.stale?'stale':cached.data.length?'ready':'empty';
  updateCameraStatus();return cached.data;
 }
 try{
  // Server filters provider station state, validates preset inCollection and
  // caches metadata. Browser need not issue provider-specific CORS requests.
  const response=await fetch('/api/cameras',{
   headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(11000)
  });
  if(!response.ok)throw Error('Camera API HTTP '+response.status);
  const data=await response.json();
  const output=Array.isArray(data.features)?data.features:[];
  const stale=data.stale===true;
  cache.set('fi-cameras',{at:Date.now(),data:output,stale});
  state.cameraStatus=stale?'stale':output.length?'ready':'empty';
  updateCameraStatus();return output;
 }catch(error){
  state.cameraStatus='offline';updateCameraStatus();
  console.debug('Traffic cameras unavailable',error);
  return cached?.data||[];
 }
}
function markerContent(kind){
 const defs={addresses:'⌂',trees:'♣',cameras:'▣',transport:'▰',traffic:'●',realty:'▤',weather:'☀'};
 return defs[kind]||'•';
}
function paintWeatherMarker(root,props){
 if(!root)return;
 let value=root.querySelector('.explore-wx-value');
 if(!value){root.textContent='';value=document.createElement('span');value.className='explore-wx-value';root.append(value)}
 value.textContent=props.symbol+' '+Math.round(props.temperature)+'°';
 let arrow=root.querySelector('.explore-wx-arrow');
 const dir=props.windDirection;
 if(dir===null||dir===undefined||!Number.isFinite(Number(dir))){
  arrow?.remove();
 }else{
  if(!arrow){arrow=document.createElement('span');arrow.className='explore-wx-arrow';arrow.textContent='↑';arrow.setAttribute('aria-hidden','true');root.append(arrow)}
  arrow.style.transform='rotate('+((Number(dir)+180)%360)+'deg)';
 }
 root.style.backgroundColor=props._color||'#35647c';
}
function cancelTreePending(){
 const pending=state.treePending;
 if(!pending)return;
 state.treePending=null;
 clearTimeout(pending.timer);
 try{pending.map.off('sourcedata',pending.listener)}catch{}
}
function clearMarkers(){
 cancelTreePending();
 if(state.drawRaf!==null){cancelAnimationFrame(state.drawRaf);state.drawRaf=null}
 state.frameQueue.cancel();
 for(const entry of state.exitingMarkers.values()){
  clearTimeout(entry.removalTimer);
  try{entry.marker.remove()}catch{}
 }
 state.exitingMarkers.clear();
 for(const entry of state.markerIndex.values())try{entry.marker.remove()}catch{}
 state.markerIndex.clear();state.markers=[];
}
function drawTreeVolumes(features){
 if(state.fallback||!state.map?.isStyleLoaded?.())return;
 const map=state.map,enabled=state.active.has('trees');
 const sources=['earthlens-tree-volumes','earthlens-tree-volumes-swap'];
 const layers=['earthlens-3d-tree-canopies','earthlens-3d-tree-canopies-swap'];
 // Keep currently visible geometry while new 3D trees stream in; use two
 // GeoJSON/extrusion buffers and crossfade instead of a one-frame setData swap.
 const changed=state.lastTreeSource!==features||state.lastTreeEnabled!==enabled
   ||(enabled&&!layers.some(id=>map.getLayer(id)));
 if(!changed)return;
 cancelTreePending();
 state.lastTreeSource=features;state.lastTreeEnabled=enabled;
 if(!enabled){
  ++state.treeEpoch;
  state.treeIndex=null;
  layers.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none')});
  return;
 }
 const limited=features.filter(f=>f.properties._kind==='trees'&&f.properties.natural==='tree')
  .slice(0,state.quality==='smooth'?165:340);
 const data={type:'FeatureCollection',features:limited.map(f=>{
  const [lon,lat]=f.geometry.coordinates;
  const height=bound(Number(f.properties.height)||9,3,32),diameter=bound(Number(f.properties.diameter_crown)||5,2,20);
  return {type:'Feature',geometry:{type:'Polygon',coordinates:canopyPolygon(lon,lat,diameter/2)},
   properties:{height,base:height*.37}};
 })};
 const oldIndex=state.treeIndex,newIndex=oldIndex===null?0:1-oldIndex;
 const source=sources[newIndex],layer=layers[newIndex];
 const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 const duration=reduceMotion?0:state.quality==='smooth'?880:600;
 try{
  // The buffer being written is transparent BEFORE data changes, so large
  // groups of newly mapped 3D trees never pop into view simultaneously.
  if(map.getLayer(layer)){
   map.setPaintProperty(layer,'fill-extrusion-opacity',0);
   map.setLayoutProperty(layer,'visibility','visible');
  }
  if(map.getSource(source))map.getSource(source).setData(data);
  else map.addSource(source,{type:'geojson',data});
  if(!map.getLayer(layer)){
   map.addLayer({id:layer,type:'fill-extrusion',source,minzoom:14.4,
    paint:{
     'fill-extrusion-color':'#2d7650',
     'fill-extrusion-height':reduceMotion?['get','height']:0,
     'fill-extrusion-height-transition':{duration,delay:0},
     'fill-extrusion-base':reduceMotion?['get','base']:0,
     'fill-extrusion-base-transition':{duration,delay:0},
     'fill-extrusion-opacity':0,
     'fill-extrusion-opacity-transition':{duration,delay:0}
    }},map.getStyle().layers.find(l=>l.type==='symbol')?.id);
  }
  const epoch=++state.treeEpoch;
  let committed=false;
  const commit=()=>{
   if(committed||epoch!==state.treeEpoch||!map.getLayer(layer))return;
   // setData() parses GeoJSON asynchronously in a worker. Starting the fade
   // before the source is ready makes trees pop in fully opaque on slow phones.
   if(map.isSourceLoaded?.(source)!==true)return;
   committed=true;
   cancelTreePending();
   map.setPaintProperty(layer,'fill-extrusion-base',['get','base']);
   map.setPaintProperty(layer,'fill-extrusion-height',['get','height']);
   map.setPaintProperty(layer,'fill-extrusion-opacity',.86);
   if(oldIndex!==null&&map.getLayer(layers[oldIndex]))
    map.setPaintProperty(layers[oldIndex],'fill-extrusion-opacity',0);
   state.treeIndex=newIndex;
  };
  const listener=event=>{
   if(event.sourceId===source&&event.isSourceLoaded)requestAnimationFrame(commit);
  };
  map.on('sourcedata',listener);
  const timer=setTimeout(()=>{
   if(!committed&&epoch===state.treeEpoch){
    // Keep the previous visible geometry if a network/provider fails.
    state.lastTreeSource=null;
    console.debug('3D tree source was not ready; retaining previous geometry');
   }
   cancelTreePending();
  },5500);
  state.treePending={map,listener,timer};
  requestAnimationFrame(commit);
 }catch(error){console.debug('3D tree transition unavailable',error)}
}
// Multiple data sources often finish within one browser frame. Coalesce their
// renders so a late source does not repeatedly cancel half-completed batches.
function draw(){
 if(!state.map||state.drawRaf!==null)return;
 state.drawRaf=requestAnimationFrame(()=>{
  state.drawRaf=null;
  if(state.map)drawNow();
 });
}
function drawNow(){
 if(!state.map)return;
 drawTreeVolumes(state.features);
 const center=state.map.getCenter(),zoom=state.map.getZoom();
 const isSmall=window.innerWidth<600||navigator.deviceMemory&&navigator.deviceMemory<=4;
 const limit=state.fallback?(state.quality==='smooth'?70:120):isSmall?(state.quality==='smooth'?75:145):(state.quality==='smooth'?165:285);
 const eligible=state.candidates.get({
  osm:state.features,cameras:state.cameraFeatures,weather:state.weatherFeatures,
  active:state.active,zoom
 });
 const target=visibleByDistance(eligible,center,zoom,limit);
 const visible=new Set(target.map(featureKey));
 state.frameQueue.submit(target,(f,i)=>{
  if(!state.map)return;
  const kind=f.properties._kind,pos=f.geometry.coordinates,key=featureKey(f);
  let entry=state.markerIndex.get(key);
  if(!entry&&state.exitingMarkers.has(key)){
   entry=state.exitingMarkers.get(key);
   state.exitingMarkers.delete(key);
   clearTimeout(entry.removalTimer);
   entry.removalTimer=null;
   entry.element?.classList.remove('is-leaving');
   if(entry.element)entry.element.style.pointerEvents='';
   state.markerIndex.set(key,entry);
  }
  if(entry){
   entry.feature=f;
   if(kind==='weather'){
    paintWeatherMarker(entry.inner,f.properties);
    try{if(state.fallback)entry.marker.setLatLng([pos[1],pos[0]]);else entry.marker.setLngLat(pos)}catch{}
   }
   return;
  }
  const text=kind==='weather'?f.properties.symbol+' '+Math.round(f.properties.temperature)+'°':markerContent(kind);
  const shell=document.createElement('div');shell.className='explore-marker-shell';
  const button=document.createElement('button');button.className='explore-marker explore-'+kind;button.type='button';button.textContent=text;
  button.title=f.properties.name+' · '+kind;button.setAttribute('aria-label',button.title);
  if(kind==='weather')button.style.backgroundColor=f.properties._color||'#35647c';
  shell.style.setProperty('--appear-delay',String(Math.min(i,16)*22)+'ms');
  shell.append(button);
  entry={marker:null,element:shell,inner:button,feature:f};
  button.addEventListener('click',event=>{event.stopPropagation();openDetail(entry.feature)});
  if(state.fallback&&state.leaflet&&state.L){
   const icon=state.L.divIcon({html:'<span class="explore-marker explore-'+kind+'">'+text+'</span>',className:'explore-leaflet explore-marker-shell',iconSize:[kind==='weather'?60:27,30],iconAnchor:[13,13]});
   const marker=state.L.marker([pos[1],pos[0]],{icon}).addTo(state.leaflet);
   marker.on('click',()=>openDetail(entry.feature));
   entry.marker=marker;entry.element=marker.getElement()||shell;
   entry.inner=entry.element.querySelector('.explore-marker')||button;
   entry.element.style.setProperty('--appear-delay',String(Math.min(i,16)*22)+'ms');
   if(kind==='weather')entry.inner.style.backgroundColor=f.properties._color||'#35647c';
  }else if(state.maplibre)entry.marker=new state.maplibre.Marker({element:shell,anchor:'center'}).setLngLat(pos).addTo(state.map);
  else return;
  if(kind==='weather')paintWeatherMarker(entry.inner,f.properties);
  state.markerIndex.set(key,entry);
 },()=>{
  for(const [key,entry] of state.markerIndex){
   if(visible.has(key))continue;
   state.markerIndex.delete(key);
   if(entry.element){entry.element.classList.add('is-leaving');entry.element.style.pointerEvents='none'}
   const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
   if(reduced)entry.marker.remove();
   else{
    // A quick return to the same street should revive the existing marker,
    // rather than creating another icon while an exit animation is pending.
    state.exitingMarkers.set(key,entry);
    entry.removalTimer=setTimeout(()=>{
     if(state.exitingMarkers.get(key)!==entry)return;
     state.exitingMarkers.delete(key);
     try{entry.marker.remove()}catch{}
    },230);
   }
  }
  state.markers=[...state.markerIndex.values()].map(entry=>entry.marker);
  const info=el('explore-count');
  if(info)info.textContent=target.length+' объектов на карте';
 },{batch:state.quality==='smooth'?(isSmall?8:18):(isSmall?14:34),budgetMs:state.quality==='smooth'?4:7});
}
async function renderWindVectors(){
 const map=state.map;
 if(state.fallback||!map?.isStyleLoaded?.())return;
 const sourceId='earthlens-weather-wind-source',layerId='earthlens-weather-wind-vectors';
 const token=++state.windEpoch;
 if(!state.active.has('weather')||!state.weatherFeatures.length){
  if(map.getLayer(layerId))map.setLayoutProperty(layerId,'visibility','none');
  return;
 }
 try{
  const vectors=await createWindGeoJSON(state.weatherFeatures);
  if(token!==state.windEpoch||!state.active.has('weather')||!state.map?.isStyleLoaded?.())return;
  if(map.getSource(sourceId))map.getSource(sourceId).setData(vectors);
  else map.addSource(sourceId,{type:'geojson',data:vectors});
  if(!map.getLayer(layerId))map.addLayer({
   id:layerId,type:'line',source:sourceId,minzoom:11,
   layout:{'line-cap':'round','line-join':'round'},
   paint:{'line-color':['get','color'],'line-width':2.7,'line-opacity':.76,'line-opacity-transition':{duration:650,delay:0}}
  },map.getStyle().layers.find(layer=>layer.type==='symbol')?.id);
  map.setLayoutProperty(layerId,'visibility','visible');
 }catch(error){console.debug('Weather wind layer unavailable',error.message)}
}
async function load(){
 if(!state.map||!el('explore-panel'))return;
 const center=state.map.getCenter(),zoom=state.map.getZoom();
 const seq=++state.seq;
 state.controller?.abort();
 const ctl=new AbortController();state.controller=ctl;
 // Keep already rendered markers visible while fresh data streams in.
 draw();
 el('explore-count').textContent='Обновляем слои…';
 const hasOSM=zoom>=13&&[...state.active].some(x=>['addresses','trees','transport','traffic','realty'].includes(x));
 const osmKey=tileKey(center,zoom,state.active);
 const osmTask=(async()=>{
  if(!hasOSM)return {features:[],stale:false};
  const cached=state.osmCache.get(osmKey);
  if(cached)return cached;
  const queryParams=new URLSearchParams({
   lat:Number(center.lat).toFixed(3),lon:Number(center.lng).toFixed(3),
   zoom:Number(zoom).toFixed(3),
   layers:[...state.active].filter(x=>['addresses','trees','transport','traffic','realty'].includes(x)).sort().join(',')
  });
  const response=await fetch('/api/osm?'+queryParams,{
   headers:{Accept:'application/json'},
   signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(16000)])
  });
  if(!response.ok)throw Error('Map geodata HTTP '+response.status);
  const data=await response.json();
  if(ctl.signal.aborted)throw new DOMException('Aborted','AbortError');
  const features=(data.elements||[]).map(toFeature).filter(Boolean);
  const result={features,stale:data.stale===true};
  state.osmCache.set(osmKey,result);
  return result;
 })();
 const cameraTask=state.active.has('cameras')&&zoom>=13?cameras():Promise.resolve([]);
 const weatherTask=state.active.has('weather')?getWeatherForView({center,zoom,signal:ctl.signal,offsetHours:state.weatherOffsetHours}):Promise.resolve([]);
 const current=()=>seq===state.seq&&!ctl.signal.aborted;
 const osmDone=osmTask.then(result=>{
  if(!current())return;
  state.features=result.features;
  state.osmStatus=!hasOSM?'idle':result.stale?'stale':'fresh';
  updateOSMStatus();draw();
 }).catch(error=>{
  if(!current())return;
  state.osmStatus='offline';
  updateOSMStatus();
  console.debug('OSM detail source unavailable; previous data remains visible',error);
 });
 const cameraDone=cameraTask.then(features=>{
  if(!current())return;
  state.cameraFeatures=features;draw();
 }).catch(error=>{if(current())console.debug('Camera provider unavailable',error)});
 const weatherDone=weatherTask.then(async features=>{
  if(!current())return;
  const coloured=await Promise.all(features.map(async feature=>({
   ...feature,properties:{...feature.properties,_color:await temperatureColor(feature.properties.temperature)}
  })));
  if(!current())return;
  state.weatherFeatures=coloured;state.weatherError=state.active.has('weather')&&coloured.length===0;
  void renderWindVectors();
  if(coloured.length)updateWeatherCard(coloured[0]);
  const note=el('explore-weather-status');
  if(note){note.hidden=!state.active.has('weather');note.textContent=state.weatherError?'Нет данных на выбранный час':state.active.has('weather')?(state.weatherOffsetHours?'Прогноз +'+state.weatherOffsetHours+' ч':'Сейчас')+' · Open-Meteo · кеш 15 мин':''}
  draw();
 }).catch(error=>{
  if(!current())return;
  state.weatherFeatures=[];state.weatherError=state.active.has('weather');
  void renderWindVectors();
  const note=el('explore-weather-status');
  if(note){note.hidden=!state.active.has('weather');note.textContent='Погода временно недоступна'}
  if(state.weatherError)console.debug('Weather provider unavailable',error);
  draw();
 });
 await Promise.allSettled([osmDone,cameraDone,weatherDone]);
 if(current())draw();
}
function updateCameraStatus(){
 const target=el('explore-camera-status');
 if(!target)return;
 target.hidden=!state.active.has('cameras');
 if(target.hidden)return;
 const messages={
  idle:'Камеры · источник Финляндия (Fintraffic)',
  ready:'Камеры · снимки Fintraffic доступны в Финляндии',
  empty:'Камеры · у поставщика сейчас нет снимков',
  stale:'Камеры · ранее полученные данные Fintraffic',
  offline:'Камеры · источник временно недоступен'
 };
 target.textContent=messages[state.cameraStatus]||messages.idle;
 target.classList.toggle('is-stale',state.cameraStatus==='offline'||state.cameraStatus==='stale');
}
function retryDataSources(){
 const now=Date.now();
 const status=el('explore-retry-status');
 if(now-state.lastManualRetry<9000){
  if(status)status.textContent='Следующая попытка возможна через несколько секунд.';
  return false;
 }
 state.lastManualRetry=now;
 state.osmCache.clear();
 cache.delete('fi-cameras');
 resetWeatherCache();
 state.controller?.abort();
 if(status)status.textContent='Повторяем запросы к активным источникам…';
 void load().finally(()=>{
  if(status)status.textContent='Проверка активных источников завершена.';
 });
 return true;
}
function updateOSMStatus(){
 const target=el('explore-osm-status');
 if(!target)return;
 const enabled=[...state.active].some(id=>['addresses','trees','transport','traffic','realty'].includes(id));
 target.hidden=!enabled;
 const statuses={
  idle:'OSM · приблизьте карту для объектов',
  fresh:'OSM · данные загружены',
  stale:'OSM · сохранённые данные (источник недоступен)',
  offline:'OSM · нет соединения, показаны ранее загруженные объекты'
 };
 target.textContent=statuses[state.osmStatus]||'';
 target.classList.toggle('is-stale',state.osmStatus==='stale'||state.osmStatus==='offline');
}
function schedule(){clearTimeout(state.timer);state.timer=setTimeout(load,window.innerWidth<650?560:460)}
function updateToggles(){
 document.querySelectorAll('[data-explore-layer]').forEach(btn=>{const active=state.active.has(btn.dataset.exploreLayer);btn.setAttribute('aria-pressed',String(active));btn.classList.toggle('on',active)});
 const row=el('explore-weather-hours');
 if(row)row.hidden=!state.active.has('weather');
 document.querySelectorAll('[data-weather-hour]').forEach(btn=>btn.setAttribute('aria-pressed',String(Number(btn.dataset.weatherHour)===state.weatherOffsetHours)));
 document.querySelectorAll('[data-render-quality]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.renderQuality===state.qualityPreference)));
 updateOSMStatus();updateCameraStatus();
 const status=el('explore-quality-status');
 if(status)status.textContent=(state.qualityPreference==='auto'?'Авто · ':'')+(state.quality==='smooth'?'плавно':'подробно');
}
function satellite(){
 if(state.fallback){el('explore-satellite').setAttribute('aria-pressed','false');return}
 const map=state.map;if(!map?.getStyle||!map.isStyleLoaded?.())return;
 const id='earthlens-imagery-satellite',provider='earthlens-world-imagery';
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 try{
  if(!state.imagery&&!map.getLayer(id)){el('explore-satellite').setAttribute('aria-pressed','false');return}
  if(!map.getSource(provider))map.addSource(provider,{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'});
  if(!map.getLayer(id))map.addLayer({id,type:'raster',source:provider,layout:{visibility:'none'},paint:{
   'raster-opacity':0,'raster-opacity-transition':{duration:reduced?0:800,delay:0},
   'raster-fade-duration':reduced?0:350
  }},['earthlens-3d-buildings','earthlens-3d-tree-canopies','earthlens-weather-wind-vectors'].find(x=>map.getLayer(x))||map.getStyle().layers.find(x=>x.type==='symbol')?.id);
  if(state.imagery){
   map.setLayoutProperty(id,'visibility','visible');
   requestAnimationFrame(()=>{if(state.imagery&&map.getLayer(id))map.setPaintProperty(id,'raster-opacity',1)});
  }else{
   map.setPaintProperty(id,'raster-opacity',0);
   setTimeout(()=>{if(!state.imagery&&map.getLayer(id))map.setLayoutProperty(id,'visibility','none')},reduced?0:850);
  }
  el('explore-satellite').setAttribute('aria-pressed',String(state.imagery));
  window.dispatchEvent(new CustomEvent('earthlens:satellite-changed',{detail:{enabled:state.imagery}}));
 }catch(error){console.debug('Imagery provider not ready',error)}
}
function buildPanel(){
 if(el('explore-panel'))return;
 const aside=document.createElement('aside');aside.id='explore-panel';aside.className='explore-panel glass';
 aside.innerHTML='<div class="explore-header"><strong>СЛОИ МИРА</strong><button type="button" id="explore-collapse" title="Свернуть панель" aria-label="Свернуть панель">−</button></div><div class="explore-layer-list">'+THEMES.map(t=>'<button type="button" data-explore-layer="'+t.id+'" aria-pressed="'+state.active.has(t.id)+'"><span>'+t.symbol+'</span>'+t.name+'</button>').join('')+'</div><div class="explore-switch-row"><button id="explore-satellite" type="button" aria-pressed="false">▧ Спутник + 3D-крыши</button><span id="explore-count">Готово</span></div><p id="explore-weather-status" class="explore-licence" hidden></p><p id="explore-osm-status" class="explore-licence" role="status" aria-live="polite" hidden></p><p id="explore-camera-status" class="explore-licence" aria-live="polite" hidden></p><div class="explore-data-retry"><button id="explore-retry" type="button" title="Обновить данные активных слоёв">↻ Обновить данные</button><small id="explore-retry-status" aria-live="polite"></small></div><div class="explore-render-quality" role="group" aria-label="Качество отображения карты"><span>ОБЪЕКТЫ</span><button type="button" data-render-quality="auto" aria-pressed="true">Авто</button><button type="button" data-render-quality="smooth" aria-pressed="false">Плавно</button><button type="button" data-render-quality="detail" aria-pressed="false">Подробно</button><small id="explore-quality-status" aria-live="polite">Авто · плавно</small></div><details class="explore-oss"><summary>30 GIS-модулей движка</summary><span>Open-source код без API-оплаты; внешние источники ограничены условиями поставщиков</span></details><p class="explore-licence">OSM / OpenFreeMap · изображения © правообладателей. Камеры: Финляндия. Другие регионы — по доступности данных.</p>';
 el('app').append(aside);
 // Keep the actual map visible on phones. Layers are one tap away, not a
 // permanent 160px sidebar covering much of the viewport.
 const collapseButton=el('explore-collapse');
 const syncCollapse=()=>{
  const collapsed=aside.classList.contains('collapsed');
  collapseButton.textContent=collapsed?'+':'−';
  collapseButton.setAttribute('aria-expanded',String(!collapsed));
  collapseButton.setAttribute('aria-label',collapsed?'Развернуть слои':'Свернуть слои');
  collapseButton.title=collapsed?'Показать слои':'Скрыть слои';
 };
 if(window.matchMedia?.('(max-width:600px)').matches)aside.classList.add('collapsed');
 syncCollapse();
 attachGeoCatalog(aside);
 const weatherHours=document.createElement('div');
 weatherHours.id='explore-weather-hours';weatherHours.className='explore-weather-hours';weatherHours.hidden=true;
 const hoursLabel=document.createElement('span');hoursLabel.textContent='ПРОГНОЗ';weatherHours.append(hoursLabel);
 for(const hours of WEATHER_HORIZONS){
  const btn=document.createElement('button');btn.type='button';btn.dataset.weatherHour=String(hours);
  btn.textContent=hours?'+'+hours+' ч':'Сейчас';weatherHours.append(btn);
 }
 aside.querySelector('.explore-layer-list').before(weatherHours);
 const addonDetails=aside.querySelector('.explore-oss');
 [...GEO_ADDONS,...GEO_ADDONS_NEXT,...GEO_ADDONS_VISUAL].forEach(addon=>{const line=document.createElement('span');line.textContent=addon.name+' · '+addon.purpose;addonDetails.append(line)});
 const detail=document.createElement('section');detail.id='explore-detail';detail.className='explore-detail glass';detail.hidden=true;detail.setAttribute('aria-label','Сведения и фотографии места');el('app').append(detail);
 updateToggles();
 satellite();
 aside.querySelectorAll('[data-explore-layer]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.exploreLayer;state.active.has(k)?state.active.delete(k):state.active.add(k);storeLayers(state.active);updateToggles();draw();void renderWindVectors();schedule()}));
 aside.querySelectorAll('[data-weather-hour]').forEach(btn=>btn.addEventListener('click',()=>{const h=Number(btn.dataset.weatherHour);if(!WEATHER_HORIZONS.includes(h))return;state.weatherOffsetHours=h;updateToggles();schedule()}));
 aside.querySelectorAll('[data-render-quality]').forEach(btn=>btn.addEventListener('click',()=>{state.qualityController?.setPreference(btn.dataset.renderQuality)}));
 el('explore-retry').addEventListener('click',retryDataSources);
 collapseButton.addEventListener('click',()=>{aside.classList.toggle('collapsed');syncCollapse()});
 el('explore-satellite').addEventListener('click',()=>{if(state.fallback){alert('Спутниковый слой доступен в WebGL-режиме.');return}state.imagery=!state.imagery;storeImagery(state.imagery);satellite()});
}
function ensureAdaptiveQuality(){
 if(state.qualityController)return;
 const env={
  width:window.innerWidth,deviceMemory:navigator.deviceMemory??8,
  connection:navigator.connection?.effectiveType||'4g',
  reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true
 };
 state.qualityController=createAdaptiveQuality({environment:env,onChange:({mode,effective})=>{
  state.qualityPreference=mode;
  storeQuality(mode);
  if(state.quality!==effective){
   state.quality=effective;
   state.lastTreeSource=null;state.lastTreeEnabled=null;
   draw();
  }
  updateToggles();
 }});
 const savedMode=restoredQuality();
 if(savedMode!=='auto')state.qualityController.setPreference(savedMode);
 state.quality=state.qualityController.effective;
 state.qualityPreference=state.qualityController.preference;
}
export function initExploreLayers({map,maplibre=null,fallback=false,leaflet=null,L=null}){
 state.map=map;state.maplibre=maplibre;state.fallback=fallback;state.leaflet=leaflet;state.L=L;
 ensureAdaptiveQuality();
 state.stopFpsSampling?.();state.stopFpsSampling=fallback?null:beginMoveFpsSampling(map,state.qualityController);
 buildPanel();
 map.on?.('moveend',()=>{draw();schedule()});
 if(!fallback){
  map.on?.('style.load',()=>{state.lastTreeSource=null;satellite();schedule()});
  // Terrain and building sources added on the first map load make
  // isStyleLoaded() temporarily false. Retry the default imagery on idle.
  map.on?.('idle',()=>{
   if(state.imagery&&!map.getLayer?.('earthlens-imagery-satellite'))satellite();
  });
  satellite();
 }
 void warmSpatialAcceleration().then(()=>{if(state.map===map)draw()});
 schedule();
}
export function updateExploreMap({map,maplibre=null,fallback=false,leaflet=null,L=null}){
 clearMarkers();state.controller?.abort();
 state.map=map;state.maplibre=maplibre;state.fallback=fallback;state.leaflet=leaflet;state.L=L;
 ensureAdaptiveQuality();
 state.stopFpsSampling?.();state.stopFpsSampling=fallback?null:beginMoveFpsSampling(map,state.qualityController);
 if(!el('explore-panel'))buildPanel();
 if(fallback&&leaflet)leaflet.on('moveend',schedule);
 schedule();
}
export async function showExploreAt(lat,lon,title='Место на карте',tags={}){
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 const fallback={type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{...tags,name:title,_kind:'place'}};
 if(tags?.name&&tags.name!==title){openDetail(fallback);return}
 if(!state.features.length){openDetail(fallback);return}
 const ticket=++state.selectEpoch;
 apiPopup(title,'Определяем ближайший объект…');
 try{
  const match=await nearestMappedFeature({lat,lon,zoom:state.map?.getZoom?.()||16,features:state.features});
  if(ticket!==state.selectEpoch)return;
  openDetail(match?.feature||fallback);
 }catch(error){
  if(ticket===state.selectEpoch){console.debug('Nearby feature lookup unavailable',error.message);openDetail(fallback)}
 }
}
export const EXTRA_OPEN_SOURCE_LIBRARIES=[...GEO_ADDONS,...GEO_ADDONS_NEXT,...GEO_ADDONS_VISUAL];
export const REALTY_PROVIDERS=providers.map(({id,name})=>({id,name,mode:'external-search-only'}));
