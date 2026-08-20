import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

import { legacyTypeFromBucketWeights, legacyVectorFromBucketWeights } from '@/lib/appearance/bucket-to-legacy'
import type { IdealImageItem, IdealMetadata } from '@/lib/appearance/metadata'
import { publicImageUrl } from '@/lib/appearance/metadata'
import { ROUND_WEIGHT } from '@/lib/appearance/preference'
import { normalizeWorldcupBucketWeights, validateWorldcupBracket } from '@/lib/profile/mobile-worldcup'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export const runtime = 'nodejs'

const CONTRACT_VERSION = 'appearance-worldcup-mobile-v1'
const REQUIRED_CANDIDATE_COUNT = 64
const REQUIRED_CHOICE_COUNT = REQUIRED_CANDIDATE_COUNT - 1

export async function GET(request: NextRequest) {
  const context = await readContext(request)
  if (!context.ok) return jsonError(context.error, context.status)

  return NextResponse.json({
    version: CONTRACT_VERSION,
    candidate_gender: context.candidateGender,
    candidates: context.pool.map((item) => ({ id: item.id, image_url: publicImageUrl(item.file) })),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PUT(request: NextRequest) {
  const context = await readContext(request)
  if (!context.ok) return jsonError(context.error, context.status)

  const body = await readJson(request)
  if (!isRecord(body) || body.version !== CONTRACT_VERSION || !Array.isArray(body.winner_ids)
    || body.winner_ids.length !== REQUIRED_CHOICE_COUNT || body.winner_ids.some((id) => typeof id !== 'string')) {
    return jsonError('invalid_worldcup_choices', 400)
  }

  const bracket = validateWorldcupBracket(context.pool, body.winner_ids as string[])
  if (!bracket) return jsonError('invalid_worldcup_choices', 400)

  const bucketWeights = normalizeWorldcupBucketWeights(bracket.roundWinners)
  const compatibilityVector = legacyVectorFromBucketWeights(context.candidateGender, bucketWeights)
  const legacyType = legacyTypeFromBucketWeights(context.candidateGender, bucketWeights)
  if (!legacyType || Object.values(compatibilityVector).every((value) => value === 0)) {
    return jsonError('worldcup_contract_unavailable', 503)
  }

  const winnerScores = bracket.roundWinners.map(({ item }) => item.measured?.appearance_score_normalized)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
  const profileUpdate = {
    preferred_appearance_vector: compatibilityVector,
    preferred_axis_z_vector: compatibilityVector,
    preferred_bucket_weights: bucketWeights,
    preferred_score_range: winnerScores.length > 0 ? {
      mean: winnerScores.reduce((sum, score) => sum + score, 0) / winnerScores.length,
      min: Math.min(...winnerScores),
      max: Math.max(...winnerScores),
    } : null,
    appearance_type: legacyType,
    worldcup_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: updated, error } = await context.supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('user_id', context.userId)
    .select('user_id')
    .maybeSingle()
  if (error) return jsonError('worldcup_save_failed', 500)
  if (!updated) return jsonError('profile_record_missing', 409)

  const worldcupSessionId = randomUUID()
  const logRows = bracket.logs.map((log) => ({
    user_id: context.userId,
    worldcup_session_id: worldcupSessionId,
    round: log.round,
    match_index: log.matchIndex,
    winner_id: log.winner.id,
    loser_id: log.loser.id,
    winner_vector: itemCompatibilityVector(context.candidateGender, log.winner),
    loser_vector: itemCompatibilityVector(context.candidateGender, log.loser),
    choice_delta_vector: subtractVectors(
      itemCompatibilityVector(context.candidateGender, log.winner),
      itemCompatibilityVector(context.candidateGender, log.loser),
    ),
    weight: ROUND_WEIGHT[log.round],
  }))
  const { error: logError } = await context.supabase.from('worldcup_choice_logs').insert(logRows)
  if (logError) console.warn('worldcup_choice_logs insert failed')

  return NextResponse.json({ ok: true })
}

async function readContext(request: NextRequest): Promise<
  | { ok: true; supabase: ReturnType<typeof createSupabaseRequestClient>; userId: string; candidateGender: 'female' | 'male'; pool: IdealImageItem[] }
  | { ok: false; error: string; status: number }
> {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized', status: 401 }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('gender').eq('user_id', user.id).maybeSingle()
  if (profileError) return { ok: false, error: 'profile_lookup_failed', status: 500 }
  if (!profile || (profile.gender !== 'female' && profile.gender !== 'male')) {
    return { ok: false, error: 'basic_profile_required', status: 409 }
  }
  const candidateGender = profile.gender === 'male' ? 'female' : 'male'
  const metadata = await readMetadata()
  const pool = metadata.items
    .filter((item) => item.gender === candidateGender && item.status === 'active' && item.measured && item.bucket_scores && item.final_bucket)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (pool.length !== REQUIRED_CANDIDATE_COUNT) {
    return { ok: false, error: 'worldcup_contract_unavailable', status: 503 }
  }
  return { ok: true, supabase, userId: user.id, candidateGender, pool }
}

async function readMetadata(): Promise<IdealMetadata> {
  const source = await readFile(join(process.cwd(), 'public', 'appearance-ideal', 'METADATA.json'), 'utf8')
  return JSON.parse(source) as IdealMetadata
}

function itemCompatibilityVector(gender: 'female' | 'male', item: IdealImageItem) {
  return legacyVectorFromBucketWeights(gender, item.bucket_scores ?? {})
}

function subtractVectors(a: Record<string, number>, b: Record<string, number>) {
  return Object.fromEntries(Object.keys(a).map((key) => [key, (a[key] ?? 0) - (b[key] ?? 0)]))
}

async function readJson(request: NextRequest): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
