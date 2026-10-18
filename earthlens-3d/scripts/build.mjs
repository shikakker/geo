import {cp,stat,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const checks=['index.html','scenes.json','open-source-stack.json'];
for(const f of checks)await stat(f);
execFileSync(process.execPath,['--check','app.js'],{stdio:'inherit'});
execFileSync('npm',['test'],{stdio:'inherit',shell:process.platform==='win32'});
for(const f of ['scenes.json','open-source-stack.json'])await cp(f,'dist/'+f);
const html=await readFile('dist/index.html','utf8');
if(!html.includes('/assets/')||!html.includes('.js'))throw Error('Vite failed to bundle the app');
const {readdir}=await import('node:fs/promises');
const assets=await readdir('dist/assets');
if(!assets.some(x=>/worker/i.test(x)&&x.endsWith('.js')))throw Error('MapLibre worker bundle missing: cannot render vector tiles');
if(!assets.some(x=>x.endsWith('.css')))throw Error('Bundled MapLibre/Leaflet CSS missing');
console.log('EarthLens verified Vite build with self-hosted JS, CSS and MapLibre worker');

// A reproducible build-time budget prevents the opt-in GIS catalog from
// silently entering the boot bundle and making mobile map interactions janky.
// Baseline (v0.7 CI): main bundle ~1.19 MB uncompressed. 1.65 MB allows room
// for new map controls but rejects accidentally importing 100 optional modules.
const match=html.match(/<script\b[^>]*\bsrc=["']\/assets\/([^"']+\.js)["']/i);
if(!match)throw Error('Cannot locate the initial JS bundle in Vite HTML');
const mainJs=match[1];
const entrySize=(await stat('dist/assets/'+mainJs)).size;
const initialLimitBytes=1_650_000;
const jsChunks=assets.filter(name=>name.endsWith('.js'));
console.log(JSON.stringify({
 check:'earthlens-startup-budget',mainJs,
 initialJsKiB:Math.round(entrySize/1024),
 limitKiB:Math.round(initialLimitBytes/1024),
 lazyChunkCount:jsChunks.length-1
}));
if(entrySize>initialLimitBytes)
 throw Error('EarthLens initial JS exceeded performance budget: '+entrySize+' bytes');
