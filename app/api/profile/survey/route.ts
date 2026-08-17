import { NextRequest, NextResponse } from 'next/server'

import {
  BIG5_SURVEY_TRAITS,
  BIG5_SURVEY_VERSION,
  parseBig5SurveyAnswers,
  scoreBig5Survey,
} from '@/lib/profile/big5-survey-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return jsonError('unauthorized', 401)

  return NextResponse.json({
    version: BIG5_SURVEY_VERSION,
    scale: { min: 1, max: 5 },
    traits: BIG5_SURVEY_TRAITS,
  })
}

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const body = await readJson(request)
  if (!isRecord(body) || body.version !== BIG5_SURVEY_VERSION) return jsonError('invalid_survey_version', 400)
  const answers = parseBig5SurveyAnswers(body.answers)
  if (!answers) return jsonError('invalid_survey_answers', 400)

  const scores = scoreBig5Survey(answers)
  const { data, error } = await supabase
    .from('profiles')
    .update({
      big5_openness: scores.openness,
      big5_conscientiousness: scores.conscientiousness,
      big5_extraversion: scores.extraversion,
      big5_agreeableness: scores.agreeableness,
      big5_neuroticism: scores.neuroticism,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .select('user_id')
    .maybeSingle()

  if (error) return jsonError('survey_save_failed', 500)
  if (!data) return jsonError('profile_record_missing', 409)
  return NextResponse.json({ ok: true })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
