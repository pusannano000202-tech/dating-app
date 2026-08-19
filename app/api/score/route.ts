import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  APPROVED_APPEARANCE_ANALYSIS_VERSION,
  type AppearanceScoreRequestFailureCode,
  requestAppearanceScore,
} from '@/lib/profile/appearance-score'
import { mapAppearanceScoreCompletion } from '@/lib/profile/appearance-score-persistence'
import {
  APPEARANCE_PHOTO_BUCKET,
  APPEARANCE_SCORE_TABLE,
  createAppearanceServiceClient,
  isOwnedAppearanceStoragePath,
} from '@/lib/profile/appearance-score-storage'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const AI_SERVER_URL =
  process.env.AI_SERVER_URL?.trim() ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8001' : '')
const AI_SERVER_TIMEOUT_MS = readPositiveInteger(process.env.AI_SERVER_TIMEOUT_MS, 30_000)
const AI_SERVER_SECRET = process.env.AI_SERVER_SECRET?.trim() || ''
const SCORE_LEASE_SECONDS = 90

type ScoreFailureCode =
  | AppearanceScoreRequestFailureCode
  | 'invalid_request'
  | 'ai_server_not_configured'
  | 'server_unavailable'
  | 'photo_read_failed'
  | 'photo_required'
  | 'photo_url_failed'
  | 'score_state_failed'
  | 'analysis_in_progress'
  | 'profile_gender_required'
  | 'profile_lookup_failed'
  | 'profile_update_failed'

type AppearanceScoreState = {
  user_id: string
  photo_revision: string | null
  analyzed_photo_revision: string | null
  status: string
  lease_expires_at: string | null
  request_id: string | null
  score_raw: number | null
  score_normalized: number | null
  confidence_0_1: number | null
  appearance_type: string | null
  provider: string | null
  model_version: string | null
  prompt_version: string | null
  anchor_version: string | null
  analyzed_at: string | null
  error_code: string | null
}

type AppearanceScoreClaim = {
  claimed: boolean
  current_status: string
  current_photo_revision: string
  current_request_id: string | null
  lease_expires_at: string | null
  attempt_count: number
  reused_existing_score: boolean
}

type AppearanceServiceClient = NonNullable<ReturnType<typeof createAppearanceServiceClient>>

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return scoreFailure('invalid_request', 400)
  }
  if (readTrigger(body) !== 'match_search') {
    return scoreFailure('invalid_request', 400)
  }

  const service = createAppearanceServiceClient()
  if (!service) return scoreFailure('server_unavailable', 503)

  const { data: storedPhotos, error: photoReadError } = await service
    .from('photos')
    .select('storage_path,sort_order')
    .eq('user_id', user.id)
    .order('sort_order')
    .limit(3)

  if (photoReadError) return scoreFailure('photo_read_failed', 503)
  const storagePaths = (storedPhotos ?? [])
    .map((photo) => photo.storage_path)
    .filter((path): path is string => isOwnedAppearanceStoragePath(path, user.id))
  if (storagePaths.length === 0 || storagePaths.length !== storedPhotos?.length) {
    return scoreFailure('photo_required', 409)
  }

  const scoreState = await readScoreState(service, user.id)
  if (scoreState === undefined) return scoreFailure('score_state_failed', 503)
  if (scoreState && isReadyAppearanceScoreState(scoreState)) {
    return NextResponse.json({
      status: 'ok',
      self_appearance_score_persisted: true,
      reused_existing_score: true,
    })
  }

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('gender')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileError) return scoreFailure('profile_lookup_failed', 503)
  const genderBank = profile?.gender
  if (genderBank !== 'female' && genderBank !== 'male') {
    return scoreFailure('profile_gender_required', 409)
  }

  if (!AI_SERVER_URL || AI_SERVER_SECRET.length < 32) {
    return scoreFailure('ai_server_not_configured', 503)
  }

  const photoRevision = scoreState?.photo_revision || randomUUID()
  const requestId = randomUUID()
  const claim = await claimScoreAnalysis(service, {
    userId: user.id,
    photoRevision,
    requestId,
  })
  if (!claim) return scoreFailure('score_state_failed', 503)
  if (claim.reused_existing_score) {
    return NextResponse.json({
      status: 'ok',
      self_appearance_score_persisted: true,
      reused_existing_score: true,
    })
  }
  if (!claim.claimed) return scoreFailure('analysis_in_progress', 409)

  const claimedState = {
    user_id: user.id,
    photo_revision: claim.current_photo_revision,
    request_id: requestId,
  }

  const signedPhotoUrls = await Promise.all(
    storagePaths.map(async (storagePath) => {
      const { data, error } = await service.storage
        .from(APPEARANCE_PHOTO_BUCKET)
        .createSignedUrl(storagePath, 300)
      return error ? null : data?.signedUrl ?? null
    }),
  )
  if (signedPhotoUrls.some((url) => !url)) {
    await markScoreFailed(service, claimedState, 'photo_url_failed')
    return scoreFailure('photo_url_failed', 503)
  }

  const aiResult = await requestAppearanceScore({
    serverUrl: AI_SERVER_URL,
    serverSecret: AI_SERVER_SECRET,
    userId: user.id,
    photoUrls: signedPhotoUrls as string[],
    genderBank,
    timeoutMs: AI_SERVER_TIMEOUT_MS,
  })
  if (!aiResult.ok) {
    await markScoreFailed(service, claimedState, aiResult.code)
    return scoreFailure(aiResult.code, aiResult.status)
  }

  const now = new Date().toISOString()
  const { data: persisted, error: updateError } = await service.rpc(
    'complete_private_appearance_score',
    mapAppearanceScoreCompletion({
      userId: user.id,
      photoRevision: claimedState.photo_revision,
      requestId,
      analyzedAt: now,
      result: aiResult,
    }),
  )

  if (updateError) {
    console.error('[appearance-score] completion RPC failed', {
      code: updateError.code,
    })
    return scoreFailure('profile_update_failed', 503)
  }
  if (!persisted) {
    console.error('[appearance-score] completion RPC did not update the active lease')
    return scoreFailure('profile_update_failed', 503)
  }

  return NextResponse.json({
    status: 'ok',
    self_appearance_score_persisted: true,
  })
}

async function readScoreState(
  service: AppearanceServiceClient,
  userId: string,
): Promise<AppearanceScoreState | null | undefined> {
  const { data, error } = await service
    .from(APPEARANCE_SCORE_TABLE)
    .select([
      'user_id',
      'photo_revision',
      'analyzed_photo_revision',
      'status',
      'lease_expires_at',
      'request_id',
      'score_raw',
      'score_normalized',
      'confidence_0_1',
      'appearance_type',
      'provider',
      'model_version',
      'prompt_version',
      'anchor_version',
      'analyzed_at',
      'error_code',
    ].join(','))
    .eq('user_id', userId)
    .maybeSingle()
  return error ? undefined : data as AppearanceScoreState | null
}

async function claimScoreAnalysis(
  service: AppearanceServiceClient,
  input: { userId: string; photoRevision: string; requestId: string },
): Promise<AppearanceScoreClaim | null> {
  const { data, error } = await service
    .rpc('claim_private_appearance_score', {
      p_user_id: input.userId,
      p_photo_revision: input.photoRevision,
      p_request_id: input.requestId,
      p_lease_seconds: SCORE_LEASE_SECONDS,
    })
    .maybeSingle()
  return error || !data ? null : data as AppearanceScoreClaim
}

async function markScoreFailed(
  service: AppearanceServiceClient,
  state: { user_id: string; photo_revision: string; request_id: string },
  errorCode: string,
) {
  await service.rpc('fail_private_appearance_score', {
    p_user_id: state.user_id,
    p_photo_revision: state.photo_revision,
    p_request_id: state.request_id,
    p_error_code: errorCode,
  })
}

function isReadyAppearanceScoreState(state: AppearanceScoreState): boolean {
  return state.status === 'ready'
    && state.photo_revision !== null
    && state.analyzed_photo_revision === state.photo_revision
    && state.request_id !== null
    && state.score_raw !== null
    && state.score_normalized !== null
    && state.confidence_0_1 !== null
    && state.appearance_type !== null
    && state.provider === 'openai'
    && state.model_version === APPROVED_APPEARANCE_ANALYSIS_VERSION.modelVersion
    && state.prompt_version === APPROVED_APPEARANCE_ANALYSIS_VERSION.promptVersion
    && state.anchor_version === APPROVED_APPEARANCE_ANALYSIS_VERSION.anchorManifestVersion
    && state.analyzed_at !== null
    && state.error_code === null
}

function scoreFailure(code: ScoreFailureCode, status: number) {
  return NextResponse.json(
    {
      status: 'error',
      code,
      self_appearance_score_persisted: false,
      self_appearance_score_persist_error: code,
    },
    { status },
  )
}

function readTrigger(body: unknown): string | null {
  return isRecord(body) && typeof body.trigger === 'string' ? body.trigger : null
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
