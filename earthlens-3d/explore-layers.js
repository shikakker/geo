import {loadGeoPhotos,PHOTO_PROXIMITY_NOTICE} from './photo-sources.js';
import {getWeatherForView,temperatureColor,WEATHER_HORIZONS} from './weather-layer.js';
import {createTTLCache,featureKey,tileKey,withinMarkers} from './layer-runtime.js';
import {GEO_ADDONS} from './geo-addons.js';
import {GEO_ADDONS_NEXT} from './geo-addons-next.js';
import {GEO_ADDONS_VISUAL} from './geo-addons-visual.js';
import {createWindGeoJSON} from './weather-wind.js';
import {nearestMappedFeature} from './places-nearby.js';
import {createFrameQueue} from './progressive-render.js';
import {warmSpatialAcceleration,visibleByDistance} from './spatial-acceleration.js';
const THEMES=[
 {id:'addresses',name:'Адреса',symbol:'⌂',on:true},
 {id:'trees',name:'Деревья и природа',symbol:'♣',on:true},
 {id:'cameras',name:'Дорожные камеры',symbol:'▣',on:false},
 {id:'transport',name:'Автобусы и остановки',symbol:'▰',on:false},
 {id:'traffic',name:'Светофоры и дороги',symbol:'◉',on:false},
 {id:'realty',name:'Недвижимость',symbol:'⌗',on:false},
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
const state={map:null,fallback:false,leaflet:null,L:null,markers:[],markerIndex:new Map(),frameQueue:createFrameQueue(),controller:null,selectEpoch:0,windEpoch:0,quality:'smooth',photoController:null,seq:0,lastBounds:'',timer:null,active:new Set(THEMES.filter(t=>t.on).map(t=>t.id)),features:[],cameraFeatures:[],weatherFeatures:[],weatherOffsetHours:0,osmCache:createTTLCache({limit:28,ttlMs:240000}),base:'streets',imagery:false,weatherError:false,lastTreeSource:null,lastTreeEnabled:null};
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
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Закрыть карточку');close.addEventListener('click',()=>{panel.hidden=true;state.photoController?.abort()});
 head.append(heading,close);panel.append(head);
 const p=document.createElement('p');p.className='explore-sub';p.textContent=details;panel.append(p);
 if(photo){const img=document.createElement('img');img.className='explore-camera-image';img.src=photo;img.alt=title;img.referrerPolicy='no-referrer';img.loading='lazy';panel.append(img)}
}
function openDetail(feature){
 const p=feature.properties||{},coordinates=feature.geometry?.coordinates||[];
 const lat=coordinates[1],lon=coordinates[0];
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 const label=p.name||p['addr:street']||p.description||'Место на карте';
 const title=p['addr:housenumber']&&p['addr:street']?p['addr:street']+', '+p['addr:housenumber']:label;
 const kind=p._kind||'Место';
 if(kind==='weather'){
   apiPopup('Погода · '+Number(lat).toFixed(3)+'°, '+Number(lon).toFixed(3)+'°', 'Модель Open-Meteo · '+(p.horizonHours?'прогноз +'+p.horizonHours+' ч':'текущие условия')+' · не измерение на месте');
   const details=document.createElement('div');details.className='explore-weather-grid';
   const metrics=[['Температура',p.temperature,'°C'],['Ощущается',p.feels,'°C'],['Ветер',p.wind,'км/ч'],['Направление ветра',p.windDirection,'° от севера'],['Осадки',p.precipitation,'мм'],['Облачность',p.clouds,'%'],['Влажность',p.humidity,'%'],['Давление',p.pressure,'гПа']];
   metrics.forEach(([key,value,unit])=>{if(value===null||value===undefined)return;const cell=document.createElement('div');cell.className='explore-weather-cell';const k=document.createElement('small');k.textContent=key;const v=document.createElement('b');v.textContent=String(Math.round(Number(value)*10)/10)+' '+unit;cell.append(k,v);details.append(cell)});
   el('explore-detail').append(details);
   const windInfo=document.createElement('p');windInfo.className='explore-sub';windInfo.textContent='Линии ветра показывают направление, а не реальную траекторию перемещения воздуха.';el('explore-detail').append(windInfo);
   const credit=document.createElement('a');credit.className='explore-weather-credit';credit.href='https://open-meteo.com/';credit.target='_blank';credit.rel='noopener noreferrer';credit.textContent='Данные и условия © Open-Meteo ↗';el('explore-detail').append(credit);
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
   const img=document.createElement('img');img.src=picture.img;img.loading='lazy';img.alt=picture.title;img.referrerPolicy='no-referrer';
   const s=document.createElement('span');s.textContent=picture.provider;
   a.append(img,s);photos.append(a);displayed++;if(displayed>=30)break;
  }
 }}).then(()=>{if(!ctl.signal.aborted&&!displayed)photos.textContent='Подтверждённых изображений рядом нет или сервисы недоступны'}).catch(()=>{if(!ctl.signal.aborted)photos.textContent='Фото временно недоступны'});
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
function dynamicRadius(zoom){return zoom>=17?380:zoom>=15?700:1400}
function overpassQuery(lat,lon,zoom){
 const r=dynamicRadius(zoom),filters=[];
 if(state.active.has('addresses'))filters.push('nwr["addr:housenumber"](around:'+r+','+lat+','+lon+');');
 if(state.active.has('trees'))filters.push('nwr["natural"~"^(tree|tree_row|wood)$"](around:'+r+','+lat+','+lon+');','nwr["leisure"="park"](around:'+r+','+lat+','+lon+');');
 if(state.active.has('transport'))filters.push('nwr["highway"="bus_stop"](around:'+r+','+lat+','+lon+');','nwr["public_transport"="platform"](around:'+r+','+lat+','+lon+');');
 if(state.active.has('traffic'))filters.push('node["highway"="traffic_signals"](around:'+r+','+lat+','+lon+');');
 if(state.active.has('realty'))filters.push('nwr["building"](around:'+Math.min(r,500)+','+lat+','+lon+');');
 return filters.length?'[out:json][timeout:18];('+filters.join('')+');out center 1500;':'';
}
async function cameras(){
 if(!state.active.has('cameras'))return [];
 if(cache.has('fi-cameras')&&Date.now()-cache.get('fi-cameras').at<2*60*60*1000)return cache.get('fi-cameras').data;
 try{
  const response=await fetch('https://tie.digitraffic.fi/api/weathercam/v1/stations',{headers:{'Digitraffic-User':'EarthLens3D/0.4 project map (browser client)',Accept:'application/json'},signal:AbortSignal.timeout(8500)});
  if(!response.ok)throw Error(response.status);
  const data=await response.json();
  const output=(data.features||[]).flatMap(f=>{
   const [lon,lat]=f.geometry?.coordinates||[],p=f.properties||{},presets=p.presets||[],preset=presets.find(x=>x.inCollection!==false&&x.id);
   if(!preset||!Number.isFinite(lon)||!Number.isFinite(lat))return [];
   return [{type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{_kind:'cameras',name:p.name||'Камера '+p.id,_image:'https://weathercam.digitraffic.fi/'+encodeURIComponent(preset.id)+'.jpg',source:'Fintraffic Digitraffic'}}];
  });
  cache.set('fi-cameras',{at:Date.now(),data:output});return output;
 }catch(e){console.debug('Traffic cameras offline',e);return []}
}
function markerContent(kind){
 const defs={addresses:'⌂',trees:'♣',cameras:'▣',transport:'▰',traffic:'●',realty:'▤',weather:'☀'};
 return defs[kind]||'•';
}
function clearMarkers(){
 state.frameQueue.cancel();
 for(const entry of state.markerIndex.values())try{entry.marker.remove()}catch{}
 state.markerIndex.clear();state.markers=[];
}
function drawTreeVolumes(features){
 if(state.fallback||!state.map?.isStyleLoaded?.())return;
 const map=state.map,source='earthlens-tree-volumes',layer='earthlens-3d-tree-canopies';
 const treeFeatures=state.active.has('trees')?features.filter(f=>f.properties._kind==='trees'&&f.properties.natural==='tree').slice(0,state.quality==='smooth'?165:340).map(f=>{const [lon,lat]=f.geometry.coordinates;const height=bound(Number(f.properties.height)||9,3,32),diameter=bound(Number(f.properties.diameter_crown)||5,2,20);return {type:'Feature',geometry:{type:'Polygon',coordinates:canopyPolygon(lon,lat,diameter/2)},properties:{height,base:height*.37}}}):[];
 const geojson={type:'FeatureCollection',features:treeFeatures};
 try{
  if(map.getSource(source)){
   if(state.lastTreeSource!==features||state.lastTreeEnabled!==state.active.has('trees'))map.getSource(source).setData(geojson);
  }else map.addSource(source,{type:'geojson',data:geojson});
  state.lastTreeSource=features;state.lastTreeEnabled=state.active.has('trees');
  if(!map.getLayer(layer)){
   const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
   map.addLayer({id:layer,type:'fill-extrusion',source,minzoom:14.4,paint:{
    'fill-extrusion-color':'#2d7650',
    'fill-extrusion-height':reduceMotion?['get','height']:0,
    'fill-extrusion-height-transition':{duration:reduceMotion?0:800,delay:0},
    'fill-extrusion-base':reduceMotion?['get','base']:0,
   'fill-extrusion-base-transition':{duration:reduceMotion?0:800,delay:0},
    'fill-extrusion-opacity':reduceMotion?.86:0,
    'fill-extrusion-opacity-transition':{duration:reduceMotion?0:900,delay:0}
   }},map.getStyle().layers.find(l=>l.type==='symbol')?.id);
   requestAnimationFrame(()=>{if(map.getLayer(layer)){map.setPaintProperty(layer,'fill-extrusion-base',['get','base']);map.setPaintProperty(layer,'fill-extrusion-height',['get','height']);map.setPaintProperty(layer,'fill-extrusion-opacity',.86)}});
  }
  map.setLayoutProperty(layer,'visibility',state.active.has('trees')?'visible':'none');
 }catch(error){console.debug('Tree geometry not supported in this style',error)}
}
function draw(){
 if(!state.map)return;
 drawTreeVolumes(state.features);
 const all=[...state.features,...state.cameraFeatures,...state.weatherFeatures];
 const center=state.map.getCenter(),zoom=state.map.getZoom();
 const isSmall=window.innerWidth<600||navigator.deviceMemory&&navigator.deviceMemory<=4;
 const limit=state.fallback?(state.quality==='smooth'?70:120):isSmall?(state.quality==='smooth'?75:145):(state.quality==='smooth'?165:285);
 const eligible=all.filter(f=>state.active.has(f.properties._kind)&&(zoom>=13||f.properties._kind==='weather'));
 const target=visibleByDistance(eligible,center,zoom,limit);
 const visible=new Set(target.map(featureKey));
 state.frameQueue.submit(target,(f,i)=>{
  if(!state.map)return;
  const kind=f.properties._kind,pos=f.geometry.coordinates,key=featureKey(f);
  let entry=state.markerIndex.get(key);
  if(entry){
   entry.feature=f;
   if(kind==='weather'){
    entry.inner.textContent=f.properties.symbol+' '+Math.round(f.properties.temperature)+'°';
    entry.inner.style.backgroundColor=f.properties._color||'#35647c';
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
  state.markerIndex.set(key,entry);
 },()=>{
  for(const [key,entry] of state.markerIndex){
   if(visible.has(key))continue;
   state.markerIndex.delete(key);
   if(entry.element){entry.element.classList.add('is-leaving');entry.element.style.pointerEvents='none'}
   const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
   if(reduced)entry.marker.remove();
   else setTimeout(()=>{try{entry.marker.remove()}catch{}},230);
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
 const query=hasOSM?overpassQuery(Number(center.lat.toFixed(4)),Number(center.lng.toFixed(4)),zoom):'';
 const osmKey=tileKey(center,zoom,state.active);
 const osmTask=(async()=>{
  if(!query)return [];
  const cached=state.osmCache.get(osmKey);
  if(cached)return cached;
  const queryParams=new URLSearchParams({
   lat:Number(center.lat).toFixed(3),lon:Number(center.lng).toFixed(3),
   zoom:Number(zoom).toFixed(1),
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
  state.osmCache.set(osmKey,features);
  return features;
 })();
 const cameraTask=state.active.has('cameras')&&zoom>=13?cameras():Promise.resolve([]);
 const weatherTask=state.active.has('weather')?getWeatherForView({center,zoom,signal:ctl.signal,offsetHours:state.weatherOffsetHours}):Promise.resolve([]);
 const current=()=>seq===state.seq&&!ctl.signal.aborted;
 const osmDone=osmTask.then(features=>{
  if(!current())return;
  state.features=features;draw();
 }).catch(error=>{if(current())console.debug('OSM detail source unavailable; previous data remains visible',error)});
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
function schedule(){clearTimeout(state.timer);state.timer=setTimeout(load,850)}
function updateToggles(){
 document.querySelectorAll('[data-explore-layer]').forEach(btn=>{const active=state.active.has(btn.dataset.exploreLayer);btn.setAttribute('aria-pressed',String(active));btn.classList.toggle('on',active)});
 const row=el('explore-weather-hours');
 if(row)row.hidden=!state.active.has('weather');
 document.querySelectorAll('[data-weather-hour]').forEach(btn=>btn.setAttribute('aria-pressed',String(Number(btn.dataset.weatherHour)===state.weatherOffsetHours)));
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
  }},map.getStyle().layers.find(x=>x.type==='symbol')?.id);
  if(state.imagery){
   map.setLayoutProperty(id,'visibility','visible');
   requestAnimationFrame(()=>{if(state.imagery&&map.getLayer(id))map.setPaintProperty(id,'raster-opacity',1)});
  }else{
   map.setPaintProperty(id,'raster-opacity',0);
   setTimeout(()=>{if(!state.imagery&&map.getLayer(id))map.setLayoutProperty(id,'visibility','none')},reduced?0:850);
  }
  el('explore-satellite').setAttribute('aria-pressed',String(state.imagery));
 }catch(error){console.debug('Imagery provider not ready',error)}
}
function buildPanel(){
 if(el('explore-panel'))return;
 const aside=document.createElement('aside');aside.id='explore-panel';aside.className='explore-panel glass';
 aside.innerHTML='<div class="explore-header"><strong>СЛОИ МИРА</strong><button type="button" id="explore-collapse" title="Свернуть панель" aria-label="Свернуть панель">−</button></div><div class="explore-layer-list">'+THEMES.map(t=>'<button type="button" data-explore-layer="'+t.id+'" aria-pressed="'+state.active.has(t.id)+'"><span>'+t.symbol+'</span>'+t.name+'</button>').join('')+'</div><div class="explore-switch-row"><button id="explore-satellite" type="button" aria-pressed="false">▧ Спутник</button><span id="explore-count">Готово</span></div><p id="explore-weather-status" class="explore-licence" hidden></p><details class="explore-oss"><summary>20 GIS-библиотек · 10 новых</summary><span>Подключаются по необходимости, без API-квот</span></details><p class="explore-licence">OSM / OpenFreeMap · изображения © правообладателей. Камеры: Финляндия. Другие регионы — по доступности данных.</p>';
 el('app').append(aside);
 const weatherHours=document.createElement('div');
 weatherHours.id='explore-weather-hours';weatherHours.className='explore-weather-hours';weatherHours.hidden=true;
 const hoursLabel=document.createElement('span');hoursLabel.textContent='ПРОГНОЗ';weatherHours.append(hoursLabel);
 for(const hours of WEATHER_HORIZONS){
  const btn=document.createElement('button');btn.type='button';btn.dataset.weatherHour=String(hours);
  btn.textContent=hours?'+'+hours+' ч':'Сейчас';weatherHours.append(btn);
 }
 aside.querySelector('.explore-layer-list').before(weatherHours);
 const addonDetails=aside.querySelector('.explore-oss');
 [...GEO_ADDONS,...GEO_ADDONS_NEXT].forEach(addon=>{const line=document.createElement('span');line.textContent=addon.name+' · '+addon.purpose;addonDetails.append(line)});
 const detail=document.createElement('section');detail.id='explore-detail';detail.className='explore-detail glass';detail.hidden=true;detail.setAttribute('aria-label','Сведения и фотографии места');el('app').append(detail);
 updateToggles();
 aside.querySelectorAll('[data-explore-layer]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.exploreLayer;state.active.has(k)?state.active.delete(k):state.active.add(k);updateToggles();draw();schedule()}));
 aside.querySelectorAll('[data-weather-hour]').forEach(btn=>btn.addEventListener('click',()=>{const h=Number(btn.dataset.weatherHour);if(!WEATHER_HORIZONS.includes(h))return;state.weatherOffsetHours=h;updateToggles();schedule()}));
 el('explore-collapse').addEventListener('click',()=>{aside.classList.toggle('collapsed');el('explore-collapse').textContent=aside.classList.contains('collapsed')?'+':'−'});
 el('explore-satellite').addEventListener('click',()=>{if(state.fallback){alert('Спутниковый слой доступен в WebGL-режиме.');return}state.imagery=!state.imagery;satellite()});
}
export function initExploreLayers({map,maplibre=null,fallback=false,leaflet=null,L=null}){
 state.map=map;state.maplibre=maplibre;state.fallback=fallback;state.leaflet=leaflet;state.L=L;
 buildPanel();
 map.on?.('moveend',schedule);
 if(!fallback)map.on?.('style.load',()=>{satellite();schedule()});
 void warmSpatialAcceleration().then(()=>{if(state.map===map)draw()});
 schedule();
}
export function updateExploreMap({map,maplibre=null,fallback=false,leaflet=null,L=null}){
 clearMarkers();state.controller?.abort();
 state.map=map;state.maplibre=maplibre;state.fallback=fallback;state.leaflet=leaflet;state.L=L;
 if(!el('explore-panel'))buildPanel();
 if(fallback&&leaflet)leaflet.on('moveend',schedule);
 schedule();
}
export function showExploreAt(lat,lon,title='Место на карте',tags={}){
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 openDetail({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{...tags,name:title,_kind:'place'}});
}
export const EXTRA_OPEN_SOURCE_LIBRARIES=[...GEO_ADDONS,...GEO_ADDONS_NEXT];
export const REALTY_PROVIDERS=providers.map(({id,name})=>({id,name,mode:'external-search-only'}));
