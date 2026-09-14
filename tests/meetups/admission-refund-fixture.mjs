import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {nativeFixture} from './native-admission-fixture.mjs'

export const refundMigration = new URL('../../supabase/migrations/20260914032930_meetup_admission_refund_workflow.sql', import.meta.url)
export const refundRpcContract = {
  summary: ['depositId','room','roomTitle','amountKrw','payment','requestId','refundState','requestedAt','approvedAt','completedAt','lastError'],
  claim: ['depositId','requestId','orderId','intentId','ownerId','room','paymentKey','providerMode','amountKrw','leaseId'],
  finalizeArguments: ['p_deposit_id','p_request_id','p_lease_id','p_order_id','p_payment_key','p_provider_transaction_key','p_refunded_amount'],
  releaseArguments: ['p_deposit_id','p_request_id','p_lease_id','p_error_code','p_retryable'],
}

// Actual admission/checkout/refund functions on embedded PostgreSQL. Synthetic
// receipts only; this is not remote Supabase, multi-connection, or PG proof.
export async function refundFixture() {
  const f = await nativeFixture()
  // The study fixture uses a minimal mentoring FK target; production has title
  // from 20260912034346_mentoring_hosted_recruitment.sql.
  await f.db.exec('alter table quantum_private.group_mentoring_sessions add column title text')
  await f.db.exec(await readFile(new URL('../../supabase/migrations/20260913102522_meetup_admission_checkout_orders.sql', import.meta.url), 'utf8'))
  await f.db.exec(`create table public.admins(user_id uuid primary key references public.users(id),role text not null check(role in('admin','super_admin')));
    alter table public.admins enable row level security;
    revoke all on public.admins from public,anon,authenticated,service_role;`)
  await f.db.query("insert into public.admins(user_id,role)values($1,'super_admin'),($2,'admin')", [f.users.computerCaptain, f.users.mechanicalCaptain])
  await f.db.exec(await readFile(refundMigration, 'utf8'))
  await f.enableNativePolicy()
  await f.db.query("update quantum_private.activity_meetup_admission_policies set amount_krw=10000,policy_version='approved-fixture-10000'where study_room_id=$1", [f.nativeRoom])
  f.rpc = (name, args=[]) => f.value(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})as value`, args)
  f.service = async(name, args=[]) => {
    await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false);select set_config('request.jwt.claim.sub','',false)")
    try { return await f.rpc(name,args) } finally { await f.db.exec('reset role') }
  }
  f.owner = async(name,args=[],user=f.users.mechanicalMember) => {
    await f.as(user); await f.db.exec('set role authenticated')
    try { return await f.rpc(name,args) } finally { await f.db.exec('reset role') }
  }
  f.paid = async({due=true,mode='test'}={}) => {
    const intent=await f.nativePrepare()
    const order=await f.service('prepare_meetup_admission_checkout_for_service',[f.users.mechanicalMember,'study',f.nativeRoom,intent.intentId,mode])
    const paymentKey='fixture-payment-'+randomUUID()
    if(due) await f.db.query("update quantum_private.activity_meetup_admission_intents set expires_at=clock_timestamp()-interval '1 minute'where id=$1",[intent.intentId])
    await f.service('record_meetup_admission_checkout_for_service',[order.ownerId,'study',f.nativeRoom,order.orderId,'confirmed',paymentKey,10000])
    const deposit=(await f.db.query('select id from quantum_private.activity_meetup_admission_deposits where intent_id=$1',[intent.intentId])).rows[0]
    return {...order,depositId:deposit.id,paymentKey}
  }
  f.request = (depositId,user) => f.owner('request_my_meetup_admission_refund',[depositId],user)
  f.review = (depositId,requestId,action='approve',actor=f.users.computerCaptain) => f.service('review_meetup_admission_refund_for_service',[actor,depositId,requestId,action])
  f.claim = (lease=randomUUID(),mode='test') => f.service('claim_meetup_admission_refunds_for_service',[lease,20,mode])
  f.finalize = (claim,overrides={}) => {
    const c={...claim,providerTransactionKey:'fixture-cancel-'+claim.requestId,...overrides}
    return f.service('finalize_meetup_admission_refund_for_service',[c.depositId,c.requestId,c.leaseId,c.orderId,c.paymentKey,c.providerTransactionKey,c.amountKrw])
  }
  f.release = (claim,error='provider_unavailable',retryable=true) => f.service('release_meetup_admission_refund_for_service',[claim.depositId,claim.requestId,claim.leaseId,error,retryable])
  return f
}
