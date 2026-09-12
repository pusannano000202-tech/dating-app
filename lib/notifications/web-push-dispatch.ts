import type { CommonPushClaim } from './web-push-contract'

export type CommonPushOutcome = 'provider_accepted'|'retry'|'expired'|'failed'|'cancelled'
export type PushDispatchDependencies = {
 claim: () => Promise<CommonPushClaim[]>
 current: (claim: CommonPushClaim) => Promise<CommonPushClaim|null>
 send: (claim: CommonPushClaim) => Promise<void>
 failure: (error: unknown) => {code:string;revoke:boolean;retry:boolean}
 complete: (claim: CommonPushClaim, outcome:CommonPushOutcome, error:string|null) => Promise<boolean>
}
/** Deliberately counts provider acceptance, never labels it phone delivery. */
export async function dispatchCommonPush(deps:PushDispatchDependencies) {
 const summary={claimed:0,providerAccepted:0,retryScheduled:0,expired:0,cancelled:0,failed:0,completionFailed:0}
 const claims=await deps.claim();summary.claimed=claims.length
 for(let index=0;index<claims.length;index+=5) {
  await Promise.all(claims.slice(index,index+5).map(async claim=>{
   let outcome:CommonPushOutcome='cancelled',code:string|null=null
   try {
    const current=await deps.current(claim)
    if(current){await deps.send(current);outcome='provider_accepted'}
   }catch(error){const failure=deps.failure(error);outcome=failure.revoke?'expired':failure.retry?'retry':'failed';code=failure.code}
   try {
    if(!await deps.complete(claim,outcome,code)){summary.completionFailed++;return}
    if(outcome==='provider_accepted')summary.providerAccepted++
    else if(outcome==='retry')summary.retryScheduled++
    else summary[outcome]++
   }catch{summary.completionFailed++}
  }))
 }
 return summary
}
