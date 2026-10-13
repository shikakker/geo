/**
 * Canvas 2.5D buildings when WebGL2 is unavailable.
 * Data comes from the same OpenFreeMap world building vector tiles as MapLibre.
 * This is deliberately NOT labelled as Gaussian Splatting or full 3D.
 */
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';

const PLANET_TILE='https://tiles.openfreemap.org/planet/latest';
const DATA_ZOOM=14;
const EARTH_CIRCUMFERENCE=40075016.686;
const tileCache=new Map();
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const mercX=(lon,z)=>(lon+180)/360*(2**z);
const mercY=(lat,z)=>(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*(2**z);
const heightOf=p=>{
  const h=Number(p.render_height??p.height);
  return Number.isFinite(h)&&h>0?Math.min(h,420):12;
};
function coordsForVisibleTiles(map){
  const b=map.getBounds(),n=2**DATA_ZOOM;
  let west=clamp(mercX(b.getWest(),DATA_ZOOM),0,n-1);
  let east=clamp(mercX(b.getEast(),DATA_ZOOM),0,n-1);
  const north=clamp(mercY(b.getNorth(),DATA_ZOOM),0,n-1);
  const south=clamp(mercY(b.getSouth(),DATA_ZOOM),0,n-1);
  if(east<west){return []} // Antimeridian is not relevant to the local building view.
  let arr=[];
  for(let x=Math.floor(west);x<=Math.floor(east);x++){
    for(let y=Math.floor(north);y<=Math.floor(south);y++)arr.push({x,y});
  }
  // Avoid large viewport requests and keep the draw GPU-free.
  const c=map.getCenter(),cx=mercX(c.lng,DATA_ZOOM),cy=mercY(c.lat,DATA_ZOOM);
  arr.sort((a,b)=>(a.x-cx)**2+(a.y-cy)**2-( (b.x-cx)**2+(b.y-cy)**2));
  return arr.slice(0,12);
}
async function fetchFeatures(x,y){
  const key=DATA_ZOOM+'/'+x+'/'+y;
  if(tileCache.has(key))return tileCache.get(key);
  const request=(async()=>{
    const url=PLANET_TILE+'/'+key+'.pbf';
    const response=await fetch(url,{mode:'cors',credentials:'omit'});
    if(!response.ok)throw Error('OpenFreeMap vector tile '+response.status+' '+key);
    const bytes=new Uint8Array(await response.arrayBuffer());
    const vector=new VectorTile(new Pbf(bytes));
    const layer=vector.layers.building;
    if(!layer)return [];
    const features=[];
    for(let i=0;i<layer.length&&i<2400;i++){
      const feat=layer.feature(i);
      if(feat.type!==3||feat.properties.hide_3d===true)continue;
      const geo=feat.toGeoJSON(x,y,DATA_ZOOM);
      if(geo.geometry?.type!=='Polygon'&&geo.geometry?.type!=='MultiPolygon')continue;
      features.push({id:key+':'+i,geometry:geo.geometry,height:heightOf(feat.properties),properties:feat.properties});
    }
    return features;
  })();
  tileCache.set(key,request);
  // Bound client-side memory, especially while flying across the planet.
  if(tileCache.size>40)tileCache.delete(tileCache.keys().next().value);
  try{return await request}catch(err){tileCache.delete(key);throw err}
}
function paths(feature){
  const g=feature.geometry;
  if(g.type==='Polygon')return[g.coordinates[0]];
  return g.coordinates.map(poly=>poly[0]).filter(Boolean);
}
export function attachCanvasBuildingLayer(leafletMap,{onData}={}){
  const pane=leafletMap.getPanes().overlayPane;
  const canvas=document.createElement('canvas');
  canvas.className='earthlens-25d-buildings';
  Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',pointerEvents:'none',zIndex:'445',opacity:'0.97'});
  pane.appendChild(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  let visible=[],epoch=0,timer=null,destroyed=false,frame=0;
  function projectRing(ring){
    const pts=[];
    for(const p of ring){
      if(!Array.isArray(p)||p.length<2)continue;
      const v=leafletMap.latLngToContainerPoint([p[1],p[0]]);
      if(Number.isFinite(v.x)&&Number.isFinite(v.y))pts.push([v.x,v.y]);
    }
    return pts;
  }
  function drawPath(pts,dy){
    ctx.beginPath();
    pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]-dy):ctx.moveTo(p[0],p[1]-dy));
    ctx.closePath();
  }
  function draw(){
    if(destroyed)return;
    const size=leafletMap.getSize(),dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.max(1,Math.round(size.x*dpr));
    canvas.height=Math.max(1,Math.round(size.y*dpr));
    canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';
    // Leaflet map pane is translated while dragging, so the canvas must be
    // anchored in layer pixels, not viewport pixels.
    const corner=leafletMap.containerPointToLayerPoint([0,0]);
    if(window.L?.DomUtil)window.L.DomUtil.setPosition(canvas,corner);
    else{canvas.style.left=corner.x+'px';canvas.style.top=corner.y+'px'}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size.x,size.y);
    if(leafletMap.getZoom()<14.4)return;
    const c=leafletMap.getCenter();
    const pxPerMeter=256*(2**leafletMap.getZoom())/(EARTH_CIRCUMFERENCE*Math.cos(c.lat*Math.PI/180));
    const render=[];
    for(const f of visible){
      for(const ring of paths(f)){
        if(ring.length<3||ring.length>200)continue;
        const pts=projectRing(ring);
        if(pts.length<3)continue;
        const bounds={minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxY:Math.max(...pts.map(p=>p[1]))};
        if(bounds.maxX< -160||bounds.minX>size.x+160||bounds.maxY< -230||bounds.minY>size.y+130)continue;
        const lift=clamp(f.height*pxPerMeter*.9,2,270);
        render.push({pts,bounds,lift,height:f.height});
      }
    }
    // Painter ordering keeps roofs of nearby buildings in front of distant ones.
    render.sort((a,b)=>a.bounds.maxY-b.bounds.maxY);
    for(const {pts,lift,height} of render.slice(0,1800)){
      const light=height>=80?['#8f9d9c','#b3beb8','#dbdcd1']:['#97a8a2','#bbc7b8','#e8e2cb'];
      ctx.lineJoin='round';ctx.lineWidth=.65;ctx.strokeStyle='#465a51c9';
      for(let i=0;i<pts.length;i++){
        const a=pts[i],b=pts[(i+1)%pts.length];
        if(Math.hypot(b[0]-a[0],b[1]-a[1])<1.5)continue;
        ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(b[0],b[1]-lift);ctx.lineTo(a[0],a[1]-lift);ctx.closePath();
        ctx.fillStyle=(b[0]-a[0]>0)?light[0]:light[1];
        ctx.fill();ctx.stroke();
        if(lift>33){
          ctx.strokeStyle='#516b5b48';ctx.lineWidth=.45;
          const count=clamp(Math.round(height/8),2,12);
          for(let floor=1;floor<count;floor++){
            const t=floor/count;
            ctx.beginPath();ctx.moveTo(a[0],a[1]-lift*t);ctx.lineTo(b[0],b[1]-lift*t);ctx.stroke();
          }
          ctx.strokeStyle='#465a51c9';ctx.lineWidth=.65;
        }
      }
      drawPath(pts,lift);ctx.fillStyle=light[2];ctx.fill();ctx.strokeStyle='#72837a';ctx.stroke();
    }
  }
  function scheduleDraw(){
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=0;draw()});
  }
  async function update(){
    if(destroyed)return;
    const e=++epoch;
    if(leafletMap.getZoom()<14.4){visible=[];scheduleDraw();onData?.(0);return}
    const locations=coordsForVisibleTiles(leafletMap);
    const values=await Promise.allSettled(locations.map(v=>fetchFeatures(v.x,v.y)));
    if(destroyed||e!==epoch)return;
    const uniq=new Set();
    visible=[];
    for(const value of values)if(value.status==='fulfilled'){
      for(const feature of value.value){
        const key=feature.id;
        if(uniq.has(key))continue;
        uniq.add(key);visible.push(feature);
      }
    }
    scheduleDraw();
    onData?.(visible.length);
  }
  function scheduleUpdate(){
    clearTimeout(timer);timer=setTimeout(()=>void update(),220);
  }
  leafletMap.on('zoomend moveend resize',scheduleUpdate);
  leafletMap.on('move',scheduleDraw);
  scheduleUpdate();
  return {
    get count(){return visible.length},
    refresh:scheduleUpdate,
    remove(){
      destroyed=true;epoch++;
      clearTimeout(timer);if(frame)cancelAnimationFrame(frame);
      leafletMap.off('zoomend moveend resize',scheduleUpdate);
      leafletMap.off('move',scheduleDraw);
      canvas.remove();
    }
  };
}
