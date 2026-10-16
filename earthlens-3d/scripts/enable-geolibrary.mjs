#!/usr/bin/env node
// Opt-in GIS library install. Never installs the entire 100-package catalog.
// Each requested package is allowlisted, npm-metadata-checked, license-checked,
// pinned exactly in package.json, and made available as a static Vite lazy chunk.
// Usage: npm run geo:add -- h3-js [d3-timer]
//        npm run geo:catalog
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {GEO_LIBRARY_CATALOG,GEO_LIBRARY_GROUPS} from '../geo-library-catalog.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const packagePath=path.join(root,'package.json');
const output=path.join(root,'geo-addon-enabled.js');
const allowedLicenses=new Set(['MIT','ISC','Apache-2.0','BSD-2-Clause','BSD-3-Clause','0BSD','CC0-1.0','Unlicense']);
const known=new Set(GEO_LIBRARY_CATALOG.map(item=>item.package));
function current(){
 return JSON.parse(readFileSync(packagePath,'utf8'));
}
function renderEnabled(pkg){
 const enabled=GEO_LIBRARY_CATALOG.filter(item=>Object.hasOwn(pkg.dependencies||{},item.package));
 const lines=enabled.map(({package:name})=>'  '+JSON.stringify(name)+':()=>import('+JSON.stringify(name)+')');
 const code='// Generated extension imports: opt-in only; every dependency becomes a lazy chunk.\n'
  +'export const GEO_ENABLED_LIBRARIES=Object.freeze({\n'+lines.join(',\n')+'\n});\n'
  +'export async function loadEnabledGeoLibrary(name){\n'
  +" const loader=GEO_ENABLED_LIBRARIES[name];\n"
  +" if(!loader)throw Error('GIS package is not installed: '+String(name));\n"
  +' return loader();\n}\n';
 return {code,enabled};
}
function list(){
 const pkg=current();
 for(const [group,names] of GEO_LIBRARY_GROUPS){
  const active=names.filter(name=>Object.hasOwn(pkg.dependencies||{},name)).length;
  process.stdout.write(group+' ('+active+'/'+names.length+' enabled)\n');
  process.stdout.write(names.map(name=>(Object.hasOwn(pkg.dependencies||{},name)?'✓ ':'· ')+name).join(', ')+'\n');
 }
 process.stdout.write('\nTotal new catalog packages: '+known.size+'; enabled: '
  +GEO_LIBRARY_CATALOG.filter(x=>Object.hasOwn(pkg.dependencies||{},x.package)).length+'\n');
}
function npmView(name){
 const raw=execFileSync('npm',['view',name+'@latest','version','license','--json'],{
  cwd:root,encoding:'utf8',timeout:25000,maxBuffer:128*1024,stdio:['ignore','pipe','pipe']
 });
 const result=JSON.parse(raw);
 if(typeof result?.version!=='string'||!/^\\d+\\.\\d+\\.\\d+(?:[-+][\\w.-]+)?$/.test(result.version))
  throw Error('npm registry did not return a valid version for '+name);
 const license=typeof result.license==='string'?result.license:'';
 if(!allowedLicenses.has(license))
  throw Error('License for '+name+' needs manual verification ('+(license||'missing')+'). No installation.');
 return {name,version:result.version,license};
}
function install(args){
 if(args.length===0||args.length>8)throw Error('Choose 1–8 package names in one command');
 const names=[...new Set(args)];
 for(const name of names){
  if(!known.has(name))throw Error('Package not in curated 100-library allowlist: '+name);
 }
 const pkg=current(),newNames=names.filter(name=>!Object.hasOwn(pkg.dependencies||{},name));
 if(!newNames.length){
  process.stdout.write('All requested packages already enabled.\n');
  writeFileSync(output,renderEnabled(pkg).code);
  return;
 }
 // All metadata requests must succeed BEFORE npm modifies the project.
 const selected=newNames.map(npmView);
 for(const p of selected)process.stdout.write('Verified '+p.name+'@'+p.version+' ('+p.license+')\n');
 execFileSync('npm',['install','--save-exact','--ignore-scripts','--no-audit','--no-fund',
  ...selected.map(({name,version})=>name+'@'+version)],{cwd:root,stdio:'inherit',timeout:180000});
 const installed=current();
 const {code,enabled}=renderEnabled(installed);
 writeFileSync(output,code,'utf8');
 process.stdout.write('Enabled '+selected.length+' new GIS packages; '
  +enabled.length+' additional lazy-loaded extension(s) total.\n');
 process.stdout.write('Run npm run check and npm run build, then commit package.json and geo-addon-enabled.js.\n');
}
const args=process.argv.slice(2);
try{
 if(args.length===0||args[0]==='--list'||args[0]==='list')list();
 else if(args[0]==='--help')process.stdout.write('Usage: npm run geo:catalog or npm run geo:add -- <package> [package]\n');
 else install(args);
}catch(error){
 process.stderr.write('Geo library installation aborted: '+String(error?.message||error)+'\n');
 process.exitCode=1;
}
