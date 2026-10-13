import {cp,stat,rm,mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const list=['index.html','app.js','styles.css'];
for(const name of list){await stat(name);if(name.endsWith('.js'))execFileSync(process.execPath,['--check',name],{stdio:'inherit'})}
const html=await readFile('index.html','utf8');if(!html.includes('./app.js')||!html.includes('./styles.css'))throw Error('Missing assets');
await rm('dist',{force:true,recursive:true});await mkdir('dist',{recursive:true});for(const name of list)await cp(name,'dist/'+name);
console.log('EarthLens build completed: dist/');