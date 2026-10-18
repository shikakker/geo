// Keyboard-accessible place search with request cancellation and result credit.
// API requests happen on Enter/submit only: no background autocomplete.
import {createGeocoder} from './geosearch.js';
export function attachPlaceSearch({form,input,box,onSelect,service=createGeocoder()}){
 if(!form||!input||!box||typeof onSelect!=='function')return null;
 let epoch=0,controller=null,disposed=false;
 input.setAttribute('aria-controls',box.id);
 input.setAttribute('aria-expanded','false');
 input.setAttribute('aria-autocomplete','none');
 box.setAttribute('role','group');box.setAttribute('aria-label','Результаты поиска мест');
 const doc=form.ownerDocument;
 function hide(focus=false){
  if(disposed)return;
  epoch++;controller?.abort();
  box.hidden=true;box.replaceChildren();
  input.setAttribute('aria-expanded','false');
  if(focus)input.focus();
 }
 function make(tag,className,text){
  const el=doc.createElement(tag);if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
 }
 async function search(event){
  event?.preventDefault?.();
  if(disposed)return;
  const query=input.value.trim();
  if(query.length<2)return;
  controller?.abort();
  controller=new AbortController();
  const token=++epoch;
  box.hidden=false;box.replaceChildren();
  box.append(make('p','search-pending','Ищем место…'));
  input.setAttribute('aria-expanded','true');
  try{
   const results=await service.search(query,{signal:controller.signal});
   if(token!==epoch||controller.signal.aborted)return;
   box.replaceChildren();
   if(!results.length){box.append(make('p','search-error','Место не найдено. Попробуйте другой запрос.'));return}
   for(const place of results){
    const button=make('button','search-option',place.title);
    button.type='button';
    button.title=place.title;
    button.setAttribute('aria-label','Показать '+place.title);
    button.addEventListener('click',()=>{
     hide(false);input.value=place.shortName;
     onSelect(place);
    });
    box.append(button);
   }
   box.append(make('p','search-source','Результаты: OpenStreetMap / Nominatim · актуальность зависит от сообщества'));
  }catch(error){
   if(token!==epoch||controller.signal.aborted)return;
   box.replaceChildren();
   box.append(make('p','search-error',error?.code==='RATE_LIMIT_LOCAL'
    ?'Подождите секунду перед повторным поиском.'
    :'Поиск временно недоступен. Попробуйте ещё раз.'));
  }
 }
 function onInputKey(event){
  if(event.key==='Escape'){hide(true);return}
  if(event.key==='ArrowDown'&&!box.hidden){
   const first=box.querySelector('.search-option');
   if(first){event.preventDefault();first.focus()}
  }
 }
 function onResultKey(event){
  if(event.key==='Escape'){event.preventDefault();hide(true);return}
  if(!['ArrowDown','ArrowUp'].includes(event.key))return;
  const options=[...box.querySelectorAll('.search-option')];
  if(!options.length)return;
  event.preventDefault();
  const i=options.indexOf(doc.activeElement);
  const index=event.key==='ArrowDown'?Math.min(options.length-1,i+1):Math.max(0,i-1);
  (options[index]||options[0]).focus();
 }
 function onOutside(event){
  if(!event.target.closest('#place-search')&&!box.hidden)hide(false);
 }
 form.addEventListener('submit',search);
 input.addEventListener('keydown',onInputKey);
 box.addEventListener('keydown',onResultKey);
 doc.addEventListener('pointerdown',onOutside);
 return {search,hide,destroy(){
  disposed=true;epoch++;controller?.abort();service.cancel();
  form.removeEventListener('submit',search);
  input.removeEventListener('keydown',onInputKey);
  box.removeEventListener('keydown',onResultKey);
  doc.removeEventListener('pointerdown',onOutside);
 }};
}
