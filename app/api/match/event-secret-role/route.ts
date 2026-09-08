import { NextRequest, NextResponse } from 'next/server'

import { parseMySecretRole } from '@/lib/matching/quantum-secret-roles'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const occurrenceId = request.nextUrl.searchParams.get('occurrence_id')?.trim() ?? ''
  return runOwnRoleOperation(request, 'read', occurrenceId)
}

export async function POST(request: NextRequest) {
  const body = await readJson(request)
  const occurrenceId = readOccurrenceId(body)
  if (!occurrenceId) return jsonError('invalid_occurrence', 400)
  return runOwnRoleOperation(request, 'change', occurrenceId)
}

export async function PUT(request: NextRequest) {
  const body = await readJson(request)
  const occurrenceId = readOccurrenceId(body)
  if (!occurrenceId) return jsonError('invalid_occurrence', 400)
  return runOwnRoleOperation(request, 'confirm', occurrenceId)
}

async function runOwnRoleOperation(
  request: NextRequest,
  operation: 'read' | 'change' | 'confirm',
  occurrenceId: string,
) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('auth_required', 401)
  if (!UUID_PATTERN.test(occurrenceId)) return jsonError('invalid_occurrence', 400)

  const rpc = operation === 'change'
    ? 'change_my_quantum_event_secret_role'
    : operation === 'confirm'
      ? 'confirm_my_quantum_event_secret_role'
      : 'get_my_quantum_event_secret_role'
  const { data, error } = await supabase.rpc(rpc, { p_occurrence_id: occurrenceId })
  if (error) return mapRpcError(error)

  const secretRole = parseMySecretRole(data)
  if (!secretRole) return jsonError('secret_role_response_invalid', 500)
  return json({ secret_role: secretRole })
}

function mapRpcError(error: { code?: string; message?: string }) {
  if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
  const message = error.message?.toLowerCase() ?? ''
  for (const code of [
    'secret_role_unavailable',
    'role_change_already_used',
    'role_change_closed',
    'role_change_partner_unavailable',
    'role_confirmation_closed',
  ]) {
    if (message.includes(code)) return jsonError(code, 409)
  }
  return jsonError('secret_role_request_failed', 500)
}

function readOccurrenceId(value: unknown): string | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'occurrence_id')) return null
  return typeof value.occurrence_id === 'string' && UUID_PATTERN.test(value.occurrence_id.trim())
    ? value.occurrence_id.trim()
    : null
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSchemaUnavailable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return error.code === 'PGRST202'
    || error.code === '42P01'
    || error.code === '42883'
    || message.includes('could not find the function')
    || message.includes('does not exist')
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
