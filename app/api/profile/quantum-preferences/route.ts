import { NextRequest, NextResponse } from 'next/server'

import {
  CURRENT_QUANTUM_DEBATE_QUESTION_BANK,
  parseQuantumProfilePreference,
} from '@/lib/matching/quantum-profile-preferences'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const MAX_JSON_BODY_BYTES = 16 * 1024
const REQUEST_TOO_LARGE = Symbol('request_too_large')

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('auth_required', 401)

  const { data, error } = await supabase.rpc('get_my_quantum_profile_preference')
  if (error) return mapRpcError(error, 'preference_lookup_failed')
  if (data === null) return json({ preference: null })

  const preference = parseQuantumProfilePreference(data)
  if (!preference) return jsonError('preference_response_invalid', 500)
  return json({ preference })
}

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('auth_required', 401)

  const body = await readJson(request)
  if (body === REQUEST_TOO_LARGE) return jsonError('request_too_large', 413)
  const candidate = isRecord(body) && 'preference' in body ? body.preference : body
  const preference = parseQuantumProfilePreference(candidate)
  if (!preference) {
    return jsonError('invalid_profile_preference', 400)
  }

  const { data, error } = await supabase.rpc('save_my_quantum_profile_preference', {
    p_payload: { ...preference, updatedAt: null },
    p_question_bank_version: CURRENT_QUANTUM_DEBATE_QUESTION_BANK.numericVersion,
  })
  if (error) return mapRpcError(error, 'preference_save_failed')

  const saved = parseQuantumProfilePreference(data)
  if (!saved) return jsonError('preference_response_invalid', 500)
  return json({ preference: saved })
}

async function readJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return REQUEST_TOO_LARGE
  }

  try {
    const body = await request.text()
    if (new TextEncoder().encode(body).byteLength > MAX_JSON_BODY_BYTES) {
      return REQUEST_TOO_LARGE
    }
    return JSON.parse(body)
  } catch {
    return null
  }
}

function mapRpcError(error: { code?: string; message?: string }, fallback: string) {
  if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('invalid_profile_preference')) {
    return jsonError('invalid_profile_preference', 400)
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
