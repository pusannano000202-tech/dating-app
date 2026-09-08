import { DEPOSIT_AMOUNT } from '../../constants'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type TonightDepositContextErrorCode =
  | 'invalid_tonight_context'
  | 'tonight_application_not_found'
  | 'deposit_not_payable'
  | 'deposit_time_gate_closed'

export class TonightDepositContextError extends Error {
  readonly code: TonightDepositContextErrorCode

  constructor(code: TonightDepositContextErrorCode) {
    super(code)
    this.name = 'TonightDepositContextError'
    this.code = code
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : null
}

export interface TonightDepositCheckoutContext {
  roundId: string
  applicationId: string
  depositDueAt: string
}

export type TonightDepositConfirmationContext = {
  mode: 'confirm' | 'reconcile' | 'recover_cancelled' | 'already_paid'
  depositId: string
  revision: number
}

export type TonightDepositCancellationContext = {
  depositId: string
  revision: number
  alreadyCancelled: boolean
}

export type TonightDepositProviderAction = 'confirm' | 'lookup' | 'already_paid'

/**
 * A provider approval may outlive our local checkout deadline. We only create a
 * new provider approval while the caller-owned checkout remains open. Once the
 * gate is closed (or the local team has already been cancelled), the existing
 * database-owned order can only be looked up and reconciled.
 */
export function chooseTonightDepositProviderAction(params: {
  confirmationMode: TonightDepositConfirmationContext['mode']
  checkoutOpen: boolean
}): TonightDepositProviderAction {
  if (params.confirmationMode === 'already_paid') return 'already_paid'
  if (params.confirmationMode !== 'confirm') return 'lookup'
  return params.checkoutOpen ? 'confirm' : 'lookup'
}

/**
 * Re-validates the current caller-owned application immediately before a
 * checkout is issued or confirmed. The input comes only from the
 * get_current_tonight_round RPC, whose application projection is auth.uid()
 * scoped; no caller-provided identity is trusted here.
 */
export function readTonightDepositCheckoutContext(
  value: unknown,
  expectedApplicationId: string,
  now = new Date(),
): TonightDepositCheckoutContext {
  const root = object(value)
  const round = object(root?.round)
  const application = object(root?.application)
  const roundId = uuid(round?.id)
  const applicationId = uuid(application?.id)
  const normalizedExpectedId = uuid(expectedApplicationId)
  const rawDepositDueAt = round?.deposit_due_at
  const depositDueAt = typeof rawDepositDueAt === 'string' ? rawDepositDueAt : null
  const deadline = depositDueAt ? Date.parse(depositDueAt) : Number.NaN

  if (!roundId || !normalizedExpectedId || !depositDueAt || !Number.isFinite(deadline)) {
    throw new TonightDepositContextError('invalid_tonight_context')
  }
  if (!applicationId || applicationId !== normalizedExpectedId) {
    throw new TonightDepositContextError('tonight_application_not_found')
  }
  const deposit = application ? application.deposit : undefined
  if (deposit !== null && !object(deposit)) {
    throw new TonightDepositContextError('invalid_tonight_context')
  }
  if (
    application?.status !== 'allocated'
    || (deposit !== null && object(deposit)?.status !== 'pending')
  ) {
    throw new TonightDepositContextError('deposit_not_payable')
  }
  if (!Number.isFinite(now.valueOf()) || now.valueOf() >= deadline) {
    throw new TonightDepositContextError('deposit_time_gate_closed')
  }

  return {
    roundId,
    applicationId,
    depositDueAt,
  }
}

/**
 * Binds the provider callback to the one active database order. A pending row
 * can be confirmed once; a paid/held row is only an idempotent replay when the
 * stored payment-key hash also matches the callback key.
 */
export function readTonightDepositConfirmationContext(
  value: unknown,
  expected: {
    applicationId: string
    userId: string
    orderId: string
    paymentKeyHash: string
  },
): TonightDepositConfirmationContext {
  const row = object(value)
  const depositId = uuid(row?.id)
  const applicationId = uuid(row?.application_id)
  const userId = uuid(row?.user_id)
  const revision = row?.revision
  if (
    !depositId
    || !applicationId
    || !userId
    || applicationId !== uuid(expected.applicationId)
    || userId !== uuid(expected.userId)
    || row?.provider_order_id !== expected.orderId
    || row?.amount !== DEPOSIT_AMOUNT
    || !Number.isInteger(revision)
    || (revision as number) < 0
  ) {
    throw new TonightDepositContextError('deposit_not_payable')
  }
  if (row?.status === 'pending' && row.provider_payment_key_hash === null) {
    return { mode: 'confirm', depositId, revision: revision as number }
  }
  if (
    (row?.status === 'paid' || row?.status === 'held')
    && row.provider_payment_key_hash === expected.paymentKeyHash
  ) {
    return { mode: 'already_paid', depositId, revision: revision as number }
  }
  if (
    row?.status === 'reconciliation_required'
    && row.provider_payment_key_hash === expected.paymentKeyHash
  ) {
    return { mode: 'reconcile', depositId, revision: revision as number }
  }
  if (row?.status === 'cancelled' && row.provider_payment_key_hash === null) {
    return { mode: 'recover_cancelled', depositId, revision: revision as number }
  }
  throw new TonightDepositContextError('deposit_not_payable')
}

/**
 * A browser cancellation can only close the one unpaid order prepared for the
 * authenticated caller. A stored provider-key hash means an approval may have
 * happened, so that state is never rewritten from an unsigned browser return.
 */
export function readTonightDepositCancellationContext(
  value: unknown,
  expected: {
    applicationId: string
    userId: string
    orderId: string
  },
): TonightDepositCancellationContext {
  const row = object(value)
  const depositId = uuid(row?.id)
  const applicationId = uuid(row?.application_id)
  const userId = uuid(row?.user_id)
  const revision = row?.revision
  if (
    !depositId
    || !applicationId
    || !userId
    || applicationId !== uuid(expected.applicationId)
    || userId !== uuid(expected.userId)
    || row?.provider_order_id !== expected.orderId
    || row?.amount !== DEPOSIT_AMOUNT
    || row?.provider_payment_key_hash !== null
    || !Number.isInteger(revision)
    || (revision as number) < 0
    || (row?.status !== 'pending' && row?.status !== 'cancelled')
  ) {
    throw new TonightDepositContextError('deposit_not_payable')
  }
  return {
    depositId,
    revision: revision as number,
    alreadyCancelled: row.status === 'cancelled',
  }
}
