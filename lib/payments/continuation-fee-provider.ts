import { getDepositPaymentReadiness } from './deposit'
import { getSupabaseAdminKeyStatus } from '../supabase-admin'
import { getPublicAppOrigin } from '../utils'
import {
  chooseContinuationFeeProvider,
  type ContinuationFeeProviderChoice,
} from './continuation-fee'

export type ContinuationFeeProviderAvailability = ContinuationFeeProviderChoice & {
  tossSandbox: boolean
  localSimulator: boolean
}

export function getContinuationFeeProviderAvailability(): ContinuationFeeProviderAvailability {
  const adminReady = getSupabaseAdminKeyStatus().ok
  const localSimulator = process.env.NODE_ENV !== 'production'
    && process.env.CONTINUATION_LOCAL_PAYMENT_SIMULATOR_ENABLED === 'true'
    && adminReady
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ''
  const secretKey = process.env.TOSS_SECRET_KEY ?? ''
  const tossSandbox = getDepositPaymentReadiness('toss').ok
    && clientKey.startsWith('test_')
    && secretKey.startsWith('test_')
    && typeof getPublicAppOrigin() === 'string'
  return {
    tossSandbox,
    localSimulator,
    ...chooseContinuationFeeProvider({ tossSandbox, localSimulator }),
  }
}
