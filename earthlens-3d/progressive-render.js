// Frame-budgeted, cancellable batch runner for new map markers.
// Marker DOM is reused by the caller. A superseding update discards stale work.
export function createFrameQueue({
 requestFrame=callback=>requestAnimationFrame(callback),
 cancelFrame=handle=>cancelAnimationFrame(handle),
 clock=()=>performance.now()
}={}){
 let frame=null,revision=0;
 function cancel(){
  revision++;
  if(frame!==null){cancelFrame(frame);frame=null}
 }
 function submit(items,onItem,onComplete=()=>{},options={}){
  cancel();
  const ticket=revision;
  const budgetMs=Math.max(1,Math.min(14,Number(options.budgetMs)||6));
  const batch=Math.max(1,Math.min(96,Number(options.batch)||24));
  let cursor=0;
  const tick=()=>{
   if(ticket!==revision)return;
   frame=null;
   const begin=clock();
   let count=0;
   while(cursor<items.length&&count<batch&&(count<4||clock()-begin<budgetMs)){
    onItem(items[cursor],cursor);
    cursor++;count++;
   }
   if(ticket!==revision)return;
   if(cursor<items.length)frame=requestFrame(tick);
   else onComplete();
  };
  frame=requestFrame(tick);
  return ()=>{if(ticket===revision)cancel()};
 }
 return {submit,cancel,get pending(){return frame!==null}};
}
