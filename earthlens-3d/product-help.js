// Local product help and data provenance. Content is static, has no tracker,
// does not read coordinates and never sends diagnostic metadata to a server.
export function mountProductHelp({root,toolbar,version='1.0'}={}){
 if(!root||!toolbar)return null;
 const doc=root.ownerDocument;
 if(doc.getElementById('earthlens-help'))return null;
 function node(tag,cls,text){
  const x=doc.createElement(tag);
  if(cls)x.className=cls;
  if(text!==undefined)x.textContent=text;
  return x;
 }
 const trigger=node('button','help-toggle','?');
 trigger.type='button';trigger.id='earthlens-help-toggle';
 trigger.title='О карте и источниках';trigger.setAttribute('aria-label','Справка и источники данных');
 trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','earthlens-help');
 toolbar.append(trigger);
 const dlg=node('dialog','earthlens-help glass');
 dlg.id='earthlens-help';dlg.setAttribute('aria-labelledby','earthlens-help-title');
 const header=node('div','earthlens-help-header');
 const h=node('h2','', 'EarthLens 3D · '+version);h.id='earthlens-help-title';
 const close=node('button','','×');close.type='button';close.title='Закрыть справку';close.setAttribute('aria-label','Закрыть справку');
 header.append(h,close);dlg.append(header);
 const p=node('p','','Карта мира с настоящими контурами 3D-зданий, рельефом и геопривязанными данными. Gaussian-сцены доступны только там, где опубликованы реальные сканы.');
 dlg.append(p);
 function section(title,description){
  const group=node('section','earthlens-help-section');
  group.append(node('h3','',title),node('p','',description));
  dlg.append(group);
 }
 section('Как управлять','Двигайте карту, приближайте объекты и вращайте 3D. Выберите слой слева, сохраните понравившееся место кнопкой ☆. Чтобы поделиться ракурсом, нажмите ↗. Слои и погода обновляются по запросу.');
 section('Границы точности','Геометрия зданий получена из OpenStreetMap; высоты, адреса и деревья заполнены неравномерно. Фотографии могут быть сняты рядом, а не в выбранном здании. Камеры отображают снимки поставщика, не прямое видео. Gaussian доступен только в известных 3D-сценах.');
 section('Конфиденциальность','Избранные места сохраняются локально в браузере, без аккаунта и облачной синхронизации. Поиск, геофотографии и погодные слои делают запросы к внешним сервисам и передают им запросы или координаты выбранной области.');
 section('Доступность','Клавиша / переводит фокус в поиск, ? открывает эту справку, Escape закрывает окно. Режим «Авто» снижает нагрузку на слабых устройствах. Настройка ОС «Уменьшение движения» отключает необязательную анимацию.');
 const links=node('div','earthlens-help-links');
 const refs=[
  ['OpenStreetMap © участники','https://www.openstreetmap.org/copyright'],
  ['Open-Meteo · лицензия и лимиты','https://open-meteo.com/en/terms'],
  ['Wikimedia Commons','https://commons.wikimedia.org/'],
  ['GitHub · исходники и ошибки','https://github.com/shikakker/geo/issues']
 ];
 for(const [label,href] of refs){
  const a=node('a','',label+' ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';
  links.append(a);
 }
 dlg.append(links);
 const footer=node('p','earthlens-help-footnote','Внешние API и фотографии не гарантируют безлимитного доступа и зависят от условий правообладателей.');
 dlg.append(footer);
 root.append(dlg);
 function open(){if(typeof dlg.showModal==='function'&&!dlg.open)dlg.showModal();else dlg.setAttribute('open','');close.focus()}
 function hide(){if(typeof dlg.close==='function'&&dlg.open)dlg.close();else dlg.removeAttribute('open');trigger.focus()}
 trigger.addEventListener('click',open);
 close.addEventListener('click',hide);
 dlg.addEventListener('click',event=>{if(event.target===dlg)hide()});
 const onKeys=event=>{
  const t=event.target;
  if(t?.closest?.('input,textarea,[contenteditable="true"]'))return;
  if(event.key==='?'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){
   event.preventDefault();if(!dlg.open)open();
  }
 };
 doc.addEventListener('keydown',onKeys);
 return {open,hide,dialog:dlg,destroy(){doc.removeEventListener('keydown',onKeys);dlg.remove();trigger.remove()}};
}
