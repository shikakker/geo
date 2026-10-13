import {cp,stat,rm,mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const assets=['index.html','app.js','styles.css','scenes.json','open-source-stack.json'];
for(const name of assets){await stat(name);if(name.endsWith('.js'))execFileSync(process.execPath,['--check',name],{stdio:'inherit'})}
const html=await readFile('index.html','utf8');
if(!html.includes('./app.js')||!html.includes('./styles.css'))throw new Error('HTML asset links missing');
const manifest=JSON.parse(await readFile('scenes.json','utf8'));
if(!Array.isArray(manifest.scenes)||manifest.scenes.some(s=>!s.url.startsWith('https://')))throw new Error('Scene manifest invalid');
const stack=JSON.parse(await readFile('open-source-stack.json','utf8'));
if(stack.libraries.length!==10)throw new Error('Expected ten OSS integrations in stack registry');
execFileSync(process.execPath,['--test','tests/integration.test.mjs'],{stdio:'inherit'});
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const name of assets)await cp(name,'dist/'+name);
console.log('EarthLens validated static build: dist/');