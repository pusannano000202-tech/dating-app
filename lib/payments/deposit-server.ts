import { createClient } from '@supabase/supabase-js'
import { DEPOSIT_AMOUNT } from '../constants'
import { getSupabaseAdminKey } from '../supabase-admin'
import { getSupabaseUrl } from '../utils'

export function createPaymentServiceClient() {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = getSupabaseAdminKey()

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function payMockDepositForMatch(params: {
  matchId: string
  groupId: string
  userId: string
}) {
  const service = createPaymentServiceClient()
  if (!service) {
    return { data: null, error: 'server_mock_payment_not_configured' }
  }

  const { data, error } = await service
    .rpc('mock_pay_deposit_for_match', {
      p_match_id: params.matchId,
      p_group_id: params.groupId,
      p_user_id: params.userId,
      p_amount: DEPOSIT_AMOUNT,
    })
    .maybeSingle()

  return {
    data,
    error: error?.message ?? null,
  }
}
