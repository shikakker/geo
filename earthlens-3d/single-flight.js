// Collapse concurrent identical requests to one provider call. A consumer may
// stop awaiting without aborting the shared transport for other map consumers.
export function createSingleFlight(){
 const pending=new Map();
 return {
  run(key,factory){
   if(pending.has(key))return pending.get(key);
   const operation=Promise.resolve().then(factory);
   pending.set(key,operation);
   void operation.then(()=>{
    if(pending.get(key)===operation)pending.delete(key);
   },()=>{
    if(pending.get(key)===operation)pending.delete(key);
   });
   return operation;
  },
  get size(){return pending.size},
  clear(){pending.clear()}
 };
}
export async function awaitWithSignal(promise,signal){
 if(!signal)return promise;
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 return new Promise((resolve,reject)=>{
  let complete=false;
  const finish=(error,value)=>{
   if(complete)return;
   complete=true;signal.removeEventListener('abort',abort);
   if(error)reject(error);else resolve(value);
  };
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error));
  if(signal.aborted)abort();
 });
}
