import {defineConfig} from 'vite';
import osmHandler from './api/osm.js';
import cameraHandler from './api/cameras.js';

// In local Vite dev/preview run the same read-only OSM proxy that Vercel serves
// from api/osm.js. Map code never contacts cross-origin Overpass directly.
function serveOSM(server){
 server.middlewares.use('/api/osm',(req,res,next)=>{
  Promise.resolve(osmHandler(req,res)).catch(next);
 });
 server.middlewares.use('/api/cameras',(req,res,next)=>{
  Promise.resolve(cameraHandler(req,res)).catch(next);
 });
}
export default defineConfig({
 plugins:[{
  name:'earthlens-local-osm-api',
  configureServer:serveOSM,
  configurePreviewServer:serveOSM
 }]
});
