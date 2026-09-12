/** All common-push writes share one queue: an old-account cleanup cannot race
 * a new-account subscription created by another mounted settings surface. */
export function createPushDeviceCoordinator(){
 let tail:Promise<unknown>|null=null,owner:string|null=null
 function exclusive<T>(work:()=>Promise<T>):Promise<T>{
  const job=tail?tail.catch(()=>undefined).then(work):work()
  tail=job
  return job.finally(()=>{if(tail===job)tail=null})
 }
 return {
  exclusive,
  rememberOwner:(value:string)=>{owner=value},
  clearOwner:()=>{owner=null},
  removeForOwner:(previous:string,cleanup:()=>Promise<void>)=>exclusive(async()=>{
   // A successful explicit new-account registration already replaced the old
   // device subscription. A delayed retry must not remove that new one.
   if(owner!==null&&owner!==previous)return
   await cleanup();owner=null
  }),
 }
}
export const commonPushDevice=createPushDeviceCoordinator()
export async function checkedPushUnsubscribe(subscription:{unsubscribe:()=>Promise<boolean>}):Promise<void>{
 if(!await subscription.unsubscribe())throw new Error('push_unsubscribe_not_confirmed')
}
