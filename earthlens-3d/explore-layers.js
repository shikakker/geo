import {loadGeoPhotos,photoProviders,PHOTO_PROXIMITY_NOTICE} from './photo-sources.js';
const OVERPASS='https://overpass.kumi.systems/api/interpreter';
const THEMES=[
 {id:'addresses',name:'Адреса',symbol:'⌂',on:true},
 {id:'trees',name:'Деревья и природа',symbol:'♣',on:true},
 {id:'cameras',name:'Дорожные камеры',symbol:'▣',on:false},
 {id:'transport',name:'Автобусы и остановки',symbol:'▰',on:false},
 {id:'traffic',name:'Светофоры и дороги',symbol:'◉',on:false},
 {id:'realty',name:'Недвижимость',symbol:'⌗',on:false}
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
const state={map:null,fallback:false,leaflet:null,L:null,markers:[],controller:null,photoController:null,seq:0,lastBounds:'',timer:null,active:new Set(THEMES.filter(t=>t.on).map(t=>t.id)),features:[],cameraFeatures:[],base:'streets',imagery:false};
const providers=[
 {id:'airbnb',name:'Airbnb',url:(lat,lon)=>'https://www.airbnb.com/s/'+lat+','+lon+'/homes'},
 {id:'booking',name:'Booking',url:(lat,lon)=>'https://www.booking.com/searchresults.html?ss='+encodeURIComponent(lat+','+lon)},
 {id:'google',name:'Google Travel',url:(lat,lon)=>'https://www.google.com/travel/search?q='+encodeURIComponent(lat+','+lon+' stays')},
 {id:'yandex',name:'Яндекс Недвижимость',url:(lat,lon)=>'https://realty.yandex.ru/?text='+encodeURIComponent(lat+','+lon)}
];
function apiPopup(title,details='',photo=null){
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
 const defs={addresses:'⌂',trees:'♣',cameras:'▣',transport:'▰',traffic:'●',realty:'▤'};
 return defs[kind]||'•';
}
function clearMarkers(){
 for(const m of state.markers)try{m.remove()}catch{}
 state.markers=[];
}
function drawTreeVolumes(features){
 if(state.fallback||!state.map?.isStyleLoaded?.())return;
 const map=state.map,source='earthlens-tree-volumes',layer='earthlens-3d-tree-canopies';
 const treeFeatures=state.active.has('trees')?features.filter(f=>f.properties._kind==='trees'&&f.properties.natural==='tree').slice(0,420).map(f=>{const [lon,lat]=f.geometry.coordinates;const height=bound(Number(f.properties.height)||9,3,32),diameter=bound(Number(f.properties.diameter_crown)||5,2,20);return {type:'Feature',geometry:{type:'Polygon',coordinates:canopyPolygon(lon,lat,diameter/2)},properties:{height,base:height*.37}}}):[];
 const geojson={type:'FeatureCollection',features:treeFeatures};
 try{
  if(map.getSource(source))map.getSource(source).setData(geojson);
  else map.addSource(source,{type:'geojson',data:geojson});
  if(!map.getLayer(layer))map.addLayer({id:layer,type:'fill-extrusion',source,minzoom:14.4,paint:{'fill-extrusion-color':'#2d7650','fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','base'],'fill-extrusion-opacity':.86}},map.getStyle().layers.find(l=>l.type==='symbol')?.id);
  map.setLayoutProperty(layer,'visibility',state.active.has('trees')?'visible':'none');
 }catch(error){console.debug('Tree geometry not supported in this style',error)}
}
function draw(){
 if(!state.map)return;
 clearMarkers();
 const all=[...state.features,...state.cameraFeatures];
 drawTreeVolumes(all);
 const center=state.map.getCenter(),limit=state.fallback?120:190,zoom=state.map.getZoom();
 if(zoom<13){el('explore-count').textContent='Приблизьте до 13+';return}
 const closest=all.filter(f=>state.active.has(f.properties._kind)).sort((a,b)=>{
  const x=a.geometry.coordinates,y=b.geometry.coordinates,ca=(x[0]-center.lng)**2+(x[1]-center.lat)**2,cb=(y[0]-center.lng)**2+(y[1]-center.lat)**2;return ca-cb;
 }).slice(0,limit);
 for(const f of closest){
  const kind=f.properties._kind,pos=f.geometry.coordinates;
  const button=document.createElement('button');button.className='explore-marker explore-'+kind;button.type='button';button.textContent=markerContent(kind);button.title=f.properties.name+' · '+kind;button.setAttribute('aria-label',button.title);
  button.addEventListener('click',event=>{event.stopPropagation();openDetail(f)});
  if(state.fallback&&state.leaflet&&state.L){
   const html='<span class="explore-marker explore-'+kind+'">'+markerContent(kind)+'</span>';
   const icon=state.L.divIcon({html,className:'explore-leaflet',iconSize:[27,27],iconAnchor:[13,13]});
   const m=state.L.marker([pos[1],pos[0]],{icon}).addTo(state.leaflet);m.on('click',()=>openDetail(f));state.markers.push(m);
  }else if(state.maplibre){state.markers.push(new state.maplibre.Marker({element:button}).setLngLat(pos).addTo(state.map))}
 }
 el('explore-count').textContent=closest.length+' объектов на карте';
}
async function load(){
 if(!state.map||!el('explore-panel'))return;
 if(state.map.getZoom()<13){state.features=[];state.cameraFeatures=[];draw();return}
 state.controller?.abort();const ctl=new AbortController();state.controller=ctl;
 const c=state.map.getCenter(),query=overpassQuery(Number(c.lat.toFixed(4)),Number(c.lng.toFixed(4)),state.map.getZoom());
 const seq=++state.seq;
 if(query){
  const key=query.replace(/-?\d+\.\d+/g,''); // cache is deliberately NOT keyed on this lossy value.
  void key;
  try{
   const resp=await fetch(OVERPASS,{method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(20000)])});
   if(!resp.ok)throw Error('Overpass HTTP '+resp.status);
   const data=await resp.json();if(seq!==state.seq||ctl.signal.aborted)return;
   state.features=(data.elements||[]).map(toFeature).filter(Boolean);
  }catch(e){if(!ctl.signal.aborted)console.debug('OSM details unavailable',e)}
 }else state.features=[];
 if(seq!==state.seq||ctl.signal.aborted)return;
 state.cameraFeatures=await cameras();if(seq===state.seq)draw();
}
function schedule(){clearTimeout(state.timer);state.timer=setTimeout(load,550)}
function updateToggles(){
 document.querySelectorAll('[data-explore-layer]').forEach(btn=>{const active=state.active.has(btn.dataset.exploreLayer);btn.setAttribute('aria-pressed',String(active));btn.classList.toggle('on',active)});
}
function satellite(){
 if(state.fallback){el('explore-satellite').setAttribute('aria-pressed','false');return}
 const map=state.map;if(!map?.getStyle||!map.isStyleLoaded?.())return;
 const id='earthlens-imagery-satellite',provider='earthlens-world-imagery';
 if(!map.getSource(provider))map.addSource(provider,{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'});
 if(!map.getLayer(id))map.addLayer({id,type:'raster',source:provider,paint:{'raster-opacity':1}},map.getStyle().layers.find(x=>x.type==='symbol')?.id);
 map.setLayoutProperty(id,'visibility',state.imagery?'visible':'none');
 el('explore-satellite').setAttribute('aria-pressed',String(state.imagery));
}
function buildPanel(){
 if(el('explore-panel'))return;
 const aside=document.createElement('aside');aside.id='explore-panel';aside.className='explore-panel glass';
 aside.innerHTML='<div class="explore-header"><strong>СЛОИ МИРА</strong><button type="button" id="explore-collapse" title="Свернуть панель" aria-label="Свернуть панель">−</button></div><div class="explore-layer-list">'+THEMES.map(t=>'<button type="button" data-explore-layer="'+t.id+'" aria-pressed="'+state.active.has(t.id)+'"><span>'+t.symbol+'</span>'+t.name+'</button>').join('')+'</div><div class="explore-switch-row"><button id="explore-satellite" type="button" aria-pressed="false">▧ Спутник</button><span id="explore-count">Готово</span></div><p class="explore-licence">OSM / OpenFreeMap · изображения © правообладателей. Камеры: Финляндия. Другие регионы — по доступности данных.</p>';
 el('app').append(aside);
 const detail=document.createElement('section');detail.id='explore-detail';detail.className='explore-detail glass';detail.hidden=true;detail.setAttribute('aria-label','Сведения и фотографии места');el('app').append(detail);
 updateToggles();
 aside.querySelectorAll('[data-explore-layer]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.exploreLayer;state.active.has(k)?state.active.delete(k):state.active.add(k);updateToggles();schedule()}));
 el('explore-collapse').addEventListener('click',()=>{aside.classList.toggle('collapsed');el('explore-collapse').textContent=aside.classList.contains('collapsed')?'+':'−'});
 el('explore-satellite').addEventListener('click',()=>{if(state.fallback){alert('Спутниковый слой доступен в WebGL-режиме.');return}state.imagery=!state.imagery;satellite()});
}
export function initExploreLayers({map,maplibre=null,fallback=false,leaflet=null,L=null}){
 state.map=map;state.maplibre=maplibre;state.fallback=fallback;state.leaflet=leaflet;state.L=L;
 buildPanel();
 map.on?.('moveend',schedule);
 if(!fallback)map.on?.('style.load',()=>{satellite();schedule()});
 schedule();
}
export function updateExploreMap({map,maplibre=null,fallback=false,leaflet=null,L=null}){
 clearMarkers();state.controller?.abort();
 state.map=map;state.maplibre=maplibre;state.fallback=fallback;state.leaflet=leaflet;state.L=L;
 schedule();
}
export function showExploreAt(lat,lon,title='Место на карте',tags={}){
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 openDetail({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{...tags,name:title,_kind:'place'}});
}
export const EXTRA_OPEN_SOURCE_LIBRARIES=LIBRARIES;
export const REALTY_PROVIDERS=providers.map(({id,name})=>({id,name,mode:'external-search-only'}));
