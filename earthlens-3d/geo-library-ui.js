// UI-only 200 library catalog. Zero packages are downloaded by opening it.
// Browser UI copies a developer install command; it NEVER installs npm modules.
import {GEO_LIBRARY_CATALOG,GEO_LIBRARY_GROUPS,filterGeoLibraries} from './geo-library-combined.js';
import {GEO_ENABLED_LIBRARIES} from './geo-addon-enabled.js';
export function attachGeoCatalog(panel){
 if(!panel||panel.querySelector('#explore-library-catalog'))return;
 const root=document.createElement('details');root.id='explore-library-catalog';root.className='explore-market';
 const summary=document.createElement('summary');summary.textContent='200 дополнительных GIS-библиотек';root.append(summary);
 const wrap=document.createElement('div');wrap.className='explore-market-body';
 const explanation=document.createElement('p');explanation.textContent='Каталог, не 200 установленных пакетов. Подключайте по одному через npm, чтобы карта не тормозила.';wrap.append(explanation);
 const filters=document.createElement('div');filters.className='explore-market-filters';
 const search=document.createElement('input');search.type='search';search.placeholder='Найти библиотеку';search.setAttribute('aria-label','Поиск по 200 GIS-библиотекам');
 const category=document.createElement('select');category.setAttribute('aria-label','Категория GIS-библиотек');
 const all=document.createElement('option');all.value='';all.textContent='Все категории';category.append(all);
 for(const [label,names] of GEO_LIBRARY_GROUPS){const option=document.createElement('option');option.value=label;option.textContent=label+' · '+names.length;category.append(option)}
 filters.append(search,category);wrap.append(filters);
 const count=document.createElement('p');count.className='explore-market-count';wrap.append(count);
 const list=document.createElement('div');list.className='explore-market-list';list.setAttribute('role','list');wrap.append(list);
 const feedback=document.createElement('p');feedback.className='explore-market-feedback';feedback.setAttribute('aria-live','polite');wrap.append(feedback);
 const note=document.createElement('p');note.textContent='Open-source код не расходует API-квоты, но внешние погодные, фото- и картографические сервисы ограничены условиями поставщика.';wrap.append(note);
 root.append(wrap);panel.append(root);
 function render(){
  const found=filterGeoLibraries(search.value,category.value);
  list.replaceChildren();
  const visible=found.slice(0,20);
  const enabled=GEO_LIBRARY_CATALOG.filter(item=>Object.hasOwn(GEO_ENABLED_LIBRARIES,item.package)).length;
  count.textContent=found.length+' найдено · '+enabled+' из 200 дополнительных установлено · первые '+visible.length;
  for(const lib of visible){
   const item=document.createElement('div');item.className='explore-market-item';item.setAttribute('role','listitem');
   const link=document.createElement('a');link.href=lib.info;link.target='_blank';link.rel='noopener noreferrer';link.textContent=lib.package;link.title=lib.category+' · npm';
   const install=document.createElement('button');install.type='button';install.textContent=Object.hasOwn(GEO_ENABLED_LIBRARIES,lib.package)?'Активна':'Копировать';
   install.disabled=Object.hasOwn(GEO_ENABLED_LIBRARIES,lib.package);
   install.setAttribute('aria-label','Скопировать команду установки '+lib.package);
   install.addEventListener('click',async()=>{
    const command='npm run geo:add -- '+lib.package;
    try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(command);feedback.textContent='Скопировано: '+command}
    catch{feedback.textContent='Команда подключения: '+command}
   });
   item.append(link,install);list.append(item);
  }
 }
 search.addEventListener('input',render);category.addEventListener('change',render);
 root.addEventListener('toggle',()=>{if(root.open)render()});
 render();
}
