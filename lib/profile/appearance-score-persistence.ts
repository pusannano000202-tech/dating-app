import type { AppearanceScoreRequestResult } from './appearance-score'

type AppearanceScoreSuccess = Extract<AppearanceScoreRequestResult, { ok: true }>

interface AppearanceScoreCompletionInput {
  userId: string
  photoRevision: string
  requestId: string
  analyzedAt: string
  result: AppearanceScoreSuccess
}

export function mapAppearanceScoreCompletion({
  userId,
  photoRevision,
  requestId,
  analyzedAt,
  result,
}: AppearanceScoreCompletionInput) {
  return {
    p_user_id: userId,
    p_photo_revision: photoRevision,
    p_request_id: requestId,
    p_provider: 'openai',
    p_model_version: result.modelVersion,
    p_prompt_version: result.promptVersion,
    p_anchor_version: result.anchorManifestVersion,
    p_score_raw: result.score,
    p_score_normalized: Math.round((result.score / 100) * 10_000) / 10_000,
    p_confidence_0_1: result.confidence,
    p_appearance_type: result.appearanceType,
    p_analyzed_at: analyzedAt,
  }
}
