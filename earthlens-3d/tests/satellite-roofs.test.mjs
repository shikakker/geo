import test from 'node:test';
import assert from 'node:assert/strict';
import {imageryTile,imageryAtlasFor,imageryUV,imageryURL,webMercator,
 roofHeight,triangulateSatelliteRoof,satelliteProjectionMatrix,
 imageryAtlasForPolygon,nearestLongitude,satelliteZoomOpacity,
 selectImageryZoom} from '../satellite-roofs.js';

test('Web Mercator satellite coordinates align geographic positions and imagery XYZ',()=>{
 assert.deepEqual(webMercator(0,0),{x:.5,y:.5});
 const n=imageryTile(0,0,16);
 assert.equal(n.x,32768);
 assert.equal(n.y,32768);
 const atlas=imageryAtlasFor(0,0,16);
 assert.deepEqual(imageryUV(0,0,atlas),[.25,.25]);
 assert.equal(imageryURL(-1,0,2),
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/0/3');
 assert.equal(imageryURL(0,-1,2),null);
});
test('Rooftop projection triangulates footprint rings and keeps UV in the correct atlas',()=>{
 const rectangle=[[
  [13.4,52.52],[13.4001,52.52],[13.4001,52.5201],
  [13.4,52.5201],[13.4,52.52]
 ]];
 const atlas=imageryAtlasFor(13.40005,52.52005,16);
 const origin=webMercator(13.4,52.52);
 const mesh=triangulateSatelliteRoof(rectangle,atlas,origin,22);
 assert.ok(mesh && mesh.length===30);
 for(let i=0;i<mesh.length;i+=5){
  assert.ok(mesh[i+3]>=0 && mesh[i+3]<=1);
  assert.ok(mesh[i+4]>=0 && mesh[i+4]<=1);
  assert.ok(mesh[i+2]>0);
 }
 const withHole=[rectangle[0],[
  [13.40002,52.52002],[13.40008,52.52002],
  [13.40008,52.52008],[13.40002,52.52008],
  [13.40002,52.52002]
 ]];
 assert.ok(triangulateSatelliteRoof(withHole,atlas,origin,22).length>30);
});
test('Height unknown/invalid does not make an unusable roof and matrix translation stays finite',()=>{
 assert.equal(roofHeight({height:30}),30);
 assert.equal(roofHeight({height:5,min_height:20}),null);
 const identity=new Float32Array([1,0,0,0, 0,1,0,0,
  0,0,1,0, 0,0,0,1]);
 const matrix=satelliteProjectionMatrix(identity,{x:.4,y:.6});
 assert.equal(matrix[12],Math.fround(.4));
 assert.equal(matrix[13],Math.fround(.6));
});

test('Large buildings use coarser but aligned photographic roof atlases',()=>{
 const wide=[[
  [13.39,52.515],[13.417,52.515],[13.417,52.525],
  [13.39,52.525],[13.39,52.515]
 ]];
 const chosen=imageryAtlasForPolygon(wide,18,14);
 assert.ok(chosen,'should find an atlas for the full roof');
 assert.ok(chosen.z<18,'do not stretch a partial imagery atlas');
 for(const point of wide[0]){
  const [u,v]=imageryUV(point[0],point[1],chosen);
  assert.ok(u>=0&&u<=1&&v>=0&&v<=1);
 }
 const origin=webMercator(13.4,52.52);
 const mesh=triangulateSatelliteRoof(wide,chosen,origin,15);
 assert.ok(mesh&&mesh.length>0,'large roof remains photographic');
 const huge=[[
  [12.5,52],[14.5,52],[14.5,53],[12.5,53],[12.5,52]
 ]];
 assert.equal(imageryAtlasForPolygon(huge,18,14),null,
  'a city-sized geometry must use the standard 3D material');
});

test('Dateline-crossing roofs use one correctly wrapped atlas and local GPU coordinates',()=>{
 const ring=[[
  [179.9996,0.001],[-179.9996,0.001],[-179.9996,-0.001],
  [179.9996,-0.001],[179.9996,0.001]
 ]];
 assert.ok(Math.abs(nearestLongitude(-179.9996,179.9996)-180.0004)<1e-8);
 const atlas=imageryAtlasForPolygon(ring,16,14);
 assert.ok(atlas);
 const origin=webMercator(-179.9999,0);
 const mesh=triangulateSatelliteRoof(ring,atlas,origin,12);
 assert.ok(mesh&&mesh.length>0);
 for(let i=0;i<mesh.length;i+=5){
  assert.ok(Math.abs(mesh[i])<0.001,'roof must render near the camera copy of the world');
  assert.ok(mesh[i+3]>=0&&mesh[i+3]<=1);
  assert.ok(mesh[i+4]>=0&&mesh[i+4]<=1);
 }
});
test('Roof imagery uses smooth zoom fade and hysteresis around tile boundaries',()=>{
 assert.equal(satelliteZoomOpacity(14.5),0);
 assert.equal(satelliteZoomOpacity(16),1);
 assert.ok(satelliteZoomOpacity(15.2)>0&&satelliteZoomOpacity(15.2)<1);
 assert.equal(selectImageryZoom(16.1,16),16);
 assert.equal(selectImageryZoom(16.3,16),17);
 assert.equal(selectImageryZoom(15.9,17),17);
 assert.equal(selectImageryZoom(15.7,17),16);
});

test('Satellite state reaches WebGL even before raster style is loaded',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../explore-layers.js',import.meta.url),'utf8');
 const start=source.indexOf('function satellite(){');
 const end=source.indexOf('function buildPanel()',start);
 assert.ok(start>=0&&end>start);
 const fn=source.slice(start,end);
 assert.ok(fn.indexOf("earthlens:satellite-changed")<fn.indexOf("map.isStyleLoaded"),
  'toggle must reach renderer before early style-load returns');
});
