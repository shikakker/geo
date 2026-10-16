// Accessible local bookmarks: save the map or selected 3D place, revisit,
// rename before saving, and remove one item. No external account or sync.
import {createSavedPlaces} from './saved-places.js';
export function mountSavedPlaces({root,toolbar,getView,onNavigate,notify=()=>{},store=createSavedPlaces()}){
 if(!root||!toolbar||!getView||!onNavigate)return null;
 if(root.querySelector('#saved-places-panel'))return null;
 const doc=root.ownerDocument;
 const make=(tag,className,text)=>{
  const node=doc.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const trigger=make('button','places-toggle','☆');
 trigger.type='button';trigger.id='saved-places-toggle';trigger.title='Избранные места';
 trigger.setAttribute('aria-label','Избранные места');
 trigger.setAttribute('aria-controls','saved-places-panel');
 trigger.setAttribute('aria-expanded','false');
 toolbar.append(trigger);
 const panel=make('section','saved-places-panel glass');
 panel.id='saved-places-panel';panel.hidden=true;
 panel.setAttribute('role','region');panel.setAttribute('aria-label','Избранные места');
 const header=make('div','saved-places-header');
 const title=make('strong','','ИЗБРАННЫЕ МЕСТА');
 const close=make('button','','×');close.type='button';close.title='Закрыть избранное';close.setAttribute('aria-label','Закрыть избранное');
 header.append(title,close);
 const intro=make('p','saved-places-description','Сохраняйте точки Земли и возвращайтесь к ним в один клик.');
 const form=make('form','saved-places-form');
 const name=make('input');name.id='saved-place-name';name.name='placeName';name.type='text';name.maxLength=80;
 name.placeholder='Название места';name.setAttribute('aria-label','Название места для сохранения');
 const save=make('button','','★ Сохранить');save.type='submit';
 form.append(name,save);
 const count=make('p','saved-places-count');count.setAttribute('aria-live','polite');
 const list=make('div','saved-places-list');list.setAttribute('role','list');
 const privacy=make('p','saved-places-privacy');
 panel.append(header,intro,form,count,list,privacy);
 root.append(panel);
 let currentSelection=null;
 let lastTrigger=null;
 function updatePrivacy(){
  privacy.textContent=store.persistent?'Хранится только в этом браузере. Не отправляется на сервер.':
   'Хранилище браузера заблокировано: избранное доступно только до закрытия страницы.';
 }
 function render(){
  const entries=store.list();
  trigger.textContent=entries.length?'★':'☆';
  trigger.setAttribute('aria-label','Избранные места: '+entries.length);
  count.textContent=entries.length?entries.length+' сохранено':'Пока ничего не сохранено';
  list.replaceChildren();
  if(!entries.length){list.append(make('p','saved-places-empty','Сохраните текущий ракурс или выберите объект на карте.'))}
  for(const place of entries){
   const item=make('div','saved-place-item');item.setAttribute('role','listitem');
   const open=make('button','saved-place-open');
   open.type='button';open.title='Перейти: '+place.title;
   const label=make('strong','',place.title);
   const coords=make('small','',place.lat.toFixed(4)+'°, '+place.lng.toFixed(4)+'° · Z '+place.zoom.toFixed(1));
   open.append(label,coords);
   open.addEventListener('click',()=>{
    onNavigate(place);
    toggle(false);
    notify('Открыто: '+place.title);
   });
   const remove=make('button','saved-place-remove','×');
   remove.type='button';remove.title='Удалить '+place.title;
   remove.setAttribute('aria-label','Удалить из избранного: '+place.title);
   remove.addEventListener('click',()=>{store.remove(place.id);notify('Место удалено из избранного')});
   item.append(open,remove);list.append(item);
  }
  updatePrivacy();
 }
 function toggle(next=!panel.hidden){
  const open=Boolean(next);
  panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
  trigger.classList.toggle('active',open);
  if(open){render();name.focus()}else if(lastTrigger===trigger)trigger.focus();
 }
 function selected({title,lat,lon}={}){
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
  currentSelection={title:String(title||'Место на карте').slice(0,80),lat,lon};
  name.value=currentSelection.title;
 }
 trigger.addEventListener('click',()=>{lastTrigger=trigger;toggle()});
 close.addEventListener('click',()=>toggle(false));
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const view=getView();
  if(!view){notify('Карта ещё загружается');return}
  const useSelected=currentSelection;
  const title=(name.value||useSelected?.title||'').trim();
  const saved=store.save({...view,...(useSelected?{lat:useSelected.lat,lng:useSelected.lon}:{}),title});
  if(!saved){notify('Не удалось сохранить координаты');return}
  currentSelection=null;name.value='';
  render();notify('Сохранено: '+saved.title);
 });
 const onSelected=event=>selected(event.detail||{});
 const onMoved=()=>{currentSelection=null};
 const onKey=event=>{
  if(event.key==='Escape'&&!panel.hidden){toggle(false)}
 };
 const win=doc.defaultView;
 win?.addEventListener('earthlens:place-selected',onSelected);
 win?.addEventListener('earthlens:camera-moved',onMoved);
 doc.addEventListener('keydown',onKey);
 store.subscribe(render);
 render();
 return {store,open:()=>toggle(true),close:()=>toggle(false),get openNow(){return !panel.hidden},destroy(){
  win?.removeEventListener('earthlens:place-selected',onSelected);
  win?.removeEventListener('earthlens:camera-moved',onMoved);
  doc.removeEventListener('keydown',onKey);trigger.remove();panel.remove()
 }};
}
