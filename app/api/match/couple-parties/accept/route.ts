import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const body = await readJson(request)
  const partyId = isRecord(body) ? cleanUuid(body.party_id) : null
  if (!partyId) return jsonError('invalid_party', 400)

  const { data, error } = await supabase.rpc('accept_quantum_couple_party', {
    p_party_id: partyId,
  })
  if (error) {
    const code = translateError(error.message)
    return jsonError(code, code === 'couple_invite_not_found' ? 404 : 409)
  }
  return NextResponse.json({ party: data }, { headers: privateResponse() })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null
}

function translateError(message = '') {
  if (message.includes('couple_invite_not_found')) return 'couple_invite_not_found'
  if (message.includes('couple_invite_not_active')) return 'couple_invite_not_active'
  return 'couple_invite_unavailable'
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: privateResponse() })
}

function privateResponse() {
  return { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
