import { NextRequest } from 'next/server'
import {
  RequestGuardError,
  requestGuardErrorResponse,
  requireRequestAccess,
} from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { privateJson, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: NextRequest) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return requestGuardErrorResponse(error)
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('admin_list_pending_matches')
  if (error) return tonightRpcErrorResponse(error)
  return privateJson({ matches: data ?? [] })
}
