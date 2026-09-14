export type RefundRoomKind = 'custom_meetup' | 'study' | 'mentoring'
export type AdmissionRefundState = 'unavailable' | 'available' | 'requested' | 'approved' | 'processing' | 'failed' | 'completed'
export type AdmissionRefundSummary = {
  depositId: string
  room: { kind: RefundRoomKind; id: string | null }
  roomTitle: string | null
  amountKrw: number
  payment: 'held' | 'refund_due' | 'refunded'
  requestId: string | null
  refundState: AdmissionRefundState
  requestedAt: string | null
  approvedAt: string | null
  completedAt: string | null
  lastError: string | null
}
/** Private worker input; never send this type to a browser. */
export type AdmissionRefundClaim = {
  depositId: string; requestId: string; intentId: string; ownerId: string; leaseId: string
  orderId: string; paymentKey: string; providerMode: 'test' | 'live'; amountKrw: number
  room: { kind: RefundRoomKind; id: string }
}
export type AdmissionRefundTransport = {
  mode: 'test' | 'live'
  lookup: (orderId: string) => Promise<unknown>
  cancel: (input: { paymentKey: string; cancelAmount: number; cancelReason: string; idempotencyKey: string }) => Promise<unknown>
}
export type RefundRpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = ['custom_meetup', 'study', 'mentoring']
const STATES = ['unavailable', 'available', 'requested', 'approved', 'processing', 'failed', 'completed']
const ERRORS = ['refund_provider_failed', 'provider_unavailable', 'provider_timeout', 'refund_proof_mismatch', 'refund_reconciliation_required', 'refund_attempts_exhausted', 'refund_owner_unavailable']
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
export const refundUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const key = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,200}$/.test(v)
const timestamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && Number.isFinite(Date.parse(v))

/** Allowlisted public projection; provider secrets and arbitrary SQL fields are dropped. */
export function parseAdmissionRefundSummary(value: unknown): AdmissionRefundSummary | null {
  const v = record(value), room = record(v?.room)
  if (!v || !room || !refundUuid(v.depositId) || !KINDS.includes(String(room.kind)) || !(room.id === null || refundUuid(room.id))
    || !Number.isSafeInteger(v.amountKrw) || Number(v.amountKrw) <= 0
    || !['held', 'refund_due', 'refunded'].includes(String(v.payment)) || !STATES.includes(String(v.refundState))
    || !(v.requestId === null || refundUuid(v.requestId))
    || !['requestedAt', 'approvedAt', 'completedAt'].every(k => v[k] === null || timestamp(v[k]))
    || !(v.lastError === null || ERRORS.includes(String(v.lastError)))
    || !(v.roomTitle === null || v.roomTitle === undefined || typeof v.roomTitle === 'string' && v.roomTitle.length <= 80)) return null
  if ((v.payment === 'held') !== (v.refundState === 'unavailable') || (v.payment === 'refunded') !== (v.refundState === 'completed')) return null
  if (['requested', 'approved', 'processing', 'failed'].includes(String(v.refundState)) && (!v.requestId || !v.requestedAt)) return null
  return {
    depositId: v.depositId, room: { kind: room.kind as RefundRoomKind, id: room.id as string | null },
    roomTitle: typeof v.roomTitle === 'string' ? v.roomTitle : null, amountKrw: Number(v.amountKrw),
    payment: v.payment as AdmissionRefundSummary['payment'], requestId: v.requestId as string | null,
    refundState: v.refundState as AdmissionRefundState, requestedAt: v.requestedAt as string | null,
    approvedAt: v.approvedAt as string | null, completedAt: v.completedAt as string | null, lastError: v.lastError as string | null,
  }
}
export function parseAdmissionRefundClaim(value: unknown): AdmissionRefundClaim | null {
  const v = record(value), room = record(v?.room)
  if (!v || !room || !['depositId', 'requestId', 'intentId', 'ownerId', 'leaseId'].every(k => refundUuid(v[k]))
    || !KINDS.includes(String(room.kind)) || !refundUuid(room.id) || v.amountKrw !== 10000
    || !['test', 'live'].includes(String(v.providerMode)) || !key(v.paymentKey)
    || v.orderId !== `meetup_${String(v.intentId).replace(/-/g, '').toLowerCase()}`) return null
  return v as unknown as AdmissionRefundClaim
}
export class AdmissionRefundError extends Error {
  constructor(readonly code: string, readonly retryable: boolean = false) { super(code); this.name = 'AdmissionRefundError' }
}
function identity(value: unknown, claim: AdmissionRefundClaim): Record<string, unknown> {
  const p = record(value)
  if (!p || p.paymentKey !== claim.paymentKey || p.orderId !== claim.orderId || p.currency !== 'KRW' || p.totalAmount !== claim.amountKrw)
    throw new AdmissionRefundError('refund_proof_mismatch')
  return p
}
function fullProof(value: unknown, claim: AdmissionRefundClaim): { transactionKey: string; amountKrw: number } {
  const p = identity(value, claim)
  if (p.status !== 'CANCELED' || p.balanceAmount !== 0 || !key(p.lastTransactionKey) || !Array.isArray(p.cancels) || !p.cancels.length)
    throw new AdmissionRefundError('refund_proof_mismatch')
  let sum = 0
  const transactions = new Set<string>()
  for (const raw of p.cancels) {
    const c = record(raw)
    if (!c || c.cancelStatus !== 'DONE' || !key(c.transactionKey) || transactions.has(c.transactionKey)
      || !Number.isSafeInteger(c.cancelAmount) || Number(c.cancelAmount) <= 0 || !timestamp(c.canceledAt)) throw new AdmissionRefundError('refund_proof_mismatch')
    transactions.add(c.transactionKey); sum += Number(c.cancelAmount)
  }
  if (sum !== claim.amountKrw || !transactions.has(p.lastTransactionKey)) throw new AdmissionRefundError('refund_proof_mismatch')
  return { transactionKey: p.lastTransactionKey, amountKrw: sum }
}
function providerFailure(error: unknown): AdmissionRefundError {
  if (error instanceof AdmissionRefundError) return error
  const e = record(error), status = Number(e?.status), retryable = !status || status === 404 || status === 408 || status === 429 || status >= 500
  return new AdmissionRefundError(retryable ? 'provider_unavailable' : 'refund_provider_failed', retryable)
}
/** Lookup first recovers a successful PG cancel whose DB acknowledgement was lost. */
export async function settleAdmissionRefundWithProvider(value: unknown, transport: AdmissionRefundTransport) {
  const claim = parseAdmissionRefundClaim(value)
  if (!claim || claim.providerMode !== transport.mode) throw new AdmissionRefundError('refund_proof_mismatch')
  try {
    const payment = identity(await transport.lookup(claim.orderId), claim)
    if (payment.status === 'CANCELED') return fullProof(payment, claim)
    if (payment.status !== 'DONE' || payment.balanceAmount !== claim.amountKrw || !timestamp(payment.approvedAt)
      || !(payment.cancels == null || Array.isArray(payment.cancels) && payment.cancels.length === 0)) throw new AdmissionRefundError('refund_reconciliation_required')
    return fullProof(await transport.cancel({ paymentKey: claim.paymentKey, cancelAmount: claim.amountKrw,
      cancelReason: 'Quantum 모임 보증금 본인 반환 신청', idempotencyKey: `meetup-refund-${claim.requestId}` }), claim)
  } catch (error) { throw providerFailure(error) }
}
export function meetupRefundConfig(env: Readonly<Record<string, string | undefined>>): { mode: 'test' | 'live' | null; ready: boolean } {
  const matched = /^(test|live)_sk_[A-Za-z0-9]+$/.exec(env.TOSS_SECRET_KEY?.trim() ?? '')?.[1]
  const mode = matched === 'test' || matched === 'live' ? matched : null
  return { mode, ready: env.QUANTUM_MEETUP_REFUNDS_ENABLED === 'true' && mode !== null && !(env.NODE_ENV === 'production' && mode === 'test') }
}
/** The caller supplies an authenticated service client. No financial context from HTTP. */
export async function processAdmissionRefundClaim(service: RefundRpc, value: unknown, leaseId: string, transport: AdmissionRefundTransport): Promise<'completed' | 'deferred' | 'invalid' | 'reconciliation'> {
  const claim = parseAdmissionRefundClaim(value)
  if (!claim || claim.leaseId !== leaseId || claim.providerMode !== transport.mode) return 'invalid'
  try {
    const proof = await settleAdmissionRefundWithProvider(claim, transport)
    const result = await service.rpc('finalize_meetup_admission_refund_for_service', {
      p_deposit_id: claim.depositId, p_request_id: claim.requestId, p_lease_id: claim.leaseId,
      p_order_id: claim.orderId, p_payment_key: claim.paymentKey,
      p_provider_transaction_key: proof.transactionKey, p_refunded_amount: proof.amountKrw,
    })
    if (result.error || parseAdmissionRefundSummary(result.data)?.refundState !== 'completed') throw new AdmissionRefundError('provider_unavailable', true)
    return 'completed'
  } catch (error) {
    const safe = providerFailure(error)
    try {
      const released = await service.rpc('release_meetup_admission_refund_for_service', {
        p_deposit_id: claim.depositId, p_request_id: claim.requestId, p_lease_id: claim.leaseId,
        p_error_code: safe.code, p_retryable: safe.retryable,
      })
      // A successful completion racing a lost response is still success.
      if (!released.error && parseAdmissionRefundSummary(released.data)?.refundState === 'completed') return 'completed'
      return released.error ? 'reconciliation' : 'deferred'
    } catch { return 'reconciliation' }
  }
}
