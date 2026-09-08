import { NextRequest, NextResponse } from 'next/server'

import {
  parseQuantumRoleGuessState,
  SECRET_ROLE_KEYS,
  type QuantumSecretRoleKey,
} from '@/lib/matching/quantum-secret-roles'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SEAT_LABEL_PATTERN = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _-]{0,23}$/

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('auth_required', 401)

  const matchId = request.nextUrl.searchParams.get('match_id')?.trim() ?? ''
  if (!UUID_PATTERN.test(matchId)) return jsonError('invalid_match', 400)

  const { data, error } = await supabase.rpc('get_my_quantum_event_role_guess_state', {
    p_match_id: matchId,
  })
  if (error) return mapRpcError(error, 'role_guess_lookup_failed')

  const guessState = parseQuantumRoleGuessState(data)
  if (!guessState) return jsonError('role_guess_response_invalid', 500)
  return json({ role_guess_state: guessState })
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('auth_required', 401)

  const body = await readJson(request)
  const matchId = isRecord(body) && typeof body.match_id === 'string'
    ? body.match_id.trim()
    : ''
  const guesses = isRecord(body) ? parseGuessSubmission(body.guesses) : null
  if (!UUID_PATTERN.test(matchId) || !guesses) {
    return jsonError('invalid_role_guesses', 400)
  }

  const { data, error } = await supabase.rpc('submit_my_quantum_event_role_guesses', {
    p_match_id: matchId,
    p_guesses: guesses,
  })
  if (error) return mapRpcError(error, 'role_guess_submit_failed')

  const guessState = parseQuantumRoleGuessState(data)
  if (!guessState) return jsonError('role_guess_response_invalid', 500)
  return json({ role_guess_state: guessState })
}

function parseGuessSubmission(value: unknown) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return null

  const seenSeats = new Set<string>()
  const guesses: Array<{ seat_label: string; role: QuantumSecretRoleKey }> = []
  for (const item of value) {
    if (!isRecord(item)
      || Object.keys(item).some((key) => key !== 'seat_label' && key !== 'role')
      || typeof item.seat_label !== 'string'
      || !SEAT_LABEL_PATTERN.test(item.seat_label)
      || typeof item.role !== 'string'
      || !(SECRET_ROLE_KEYS as readonly string[]).includes(item.role)
      || seenSeats.has(item.seat_label)) {
      return null
    }
    seenSeats.add(item.seat_label)
    guesses.push({
      seat_label: item.seat_label,
      role: item.role as QuantumSecretRoleKey,
    })
  }
  return guesses
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function mapRpcError(error: { code?: string; message?: string }, fallback: string) {
  if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
  const message = error.message?.toLowerCase() ?? ''
  for (const code of [
    'role_guessing_not_open',
    'role_guessing_closed',
    'role_guesses_already_submitted',
  ]) {
    if (message.includes(code)) return jsonError(code, 409)
  }
  if (message.includes('role_guessing_not_allowed')) {
    return jsonError('role_guessing_not_allowed', 403)
  }
  if (message.includes('role_guessing_not_available')) {
    return jsonError('role_guessing_not_available', 403)
  }
  if (message.includes('invalid_') || message.includes('self_guess_not_allowed')) {
    return jsonError('invalid_role_guesses', 400)
  }
  return jsonError(fallback, 500)
}

function isSchemaUnavailable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return error.code === 'PGRST202'
    || error.code === '42P01'
    || error.code === '42883'
    || message.includes('could not find the function')
    || message.includes('does not exist')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function jsonError(error: string, status: number) {
  return json({ error }, status)
}
