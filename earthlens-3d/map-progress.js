// Lightweight tile-loading feedback. Does not hide, replace or blur the map.
// Never reports invented percentages; map engines do not expose total tile work.
export function createMapProgress(root=document.getElementById('app')){
 if(!root)return {start(){},end(){},dispose(){}};
 const el=document.createElement('div');
 el.id='earthlens-stream-status';
 el.className='earthlens-stream-status glass';
 el.setAttribute('role','status');
 el.setAttribute('aria-live','polite');
 el.innerHTML='<span class="stream-pulse" aria-hidden="true"></span><span class="stream-message">Загружаем карту…</span><span class="stream-track" aria-hidden="true"><span></span></span>';
 root.append(el);
 const label=el.querySelector('.stream-message');
 let timer=null,stopTimer=null,maxTimer=null,disposed=false,busy=false;
 function end(){
  busy=false;
  clearTimeout(timer);clearTimeout(maxTimer);clearTimeout(stopTimer);
  stopTimer=setTimeout(()=>{if(!busy)el.classList.remove('is-visible')},180);
 }
 function start(message='Подгружаем карту…'){
  if(disposed)return;
  label.textContent=message;
  if(busy)return;
  busy=true;
  clearTimeout(stopTimer);
  timer=setTimeout(()=>{if(busy)el.classList.add('is-visible')},300);
  maxTimer=setTimeout(end,8500);
 }
 function dispose(){disposed=true;end();el.remove()}
 return {start,end,dispose,get visible(){return el.classList.contains('is-visible')}};
}
export function watchMapTiles(map,indicator){
 const onData=event=>{if(event?.dataType==='source')indicator.start('Подгружаем объекты и тайлы…')};
 const onIdle=()=>indicator.end();
 map.on('dataloading',onData);
 map.on('idle',onIdle);
 return ()=>{map.off('dataloading',onData);map.off('idle',onIdle)};
}
