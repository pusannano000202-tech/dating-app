import {parseCandidateScope} from './candidate-board-contract'
import type {CandidateScope} from './candidate-board-contract'

/** Availability only. No quote, balance, paid entitlement or reservation exists yet. */
export type CandidateDepositContext = {
 owner_id:string
 scope:CandidateScope
 quote:null
 policy:null
 checkout_enabled:false
 preparation_only:true
 funding:'unavailable'
}

const keys=['owner_id','scope','quote','policy','checkout_enabled','preparation_only','funding']
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseCandidateDepositContext(value:unknown):CandidateDepositContext|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const data=value as Record<string,unknown>
 if(Object.keys(data).length!==keys.length||!keys.every(key=>Object.hasOwn(data,key))
  ||typeof data.owner_id!=='string'||!uuid.test(data.owner_id)
  ||data.quote!==null||data.policy!==null||data.checkout_enabled!==false
  ||data.preparation_only!==true||data.funding!=='unavailable')return null
 const scope=parseCandidateScope(data.scope)
 if(!scope)return null
 return{owner_id:data.owner_id,scope,quote:null,policy:null,checkout_enabled:false,preparation_only:true,funding:'unavailable'}
}
