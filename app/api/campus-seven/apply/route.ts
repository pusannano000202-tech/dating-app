import { NextRequest, NextResponse } from 'next/server'
import {
  CAMPUS_SEVEN_PREFERENCE_QUESTIONS,
  containsProhibitedContact,
  getCampusSevenFeatureState,
  isAdultOnDate,
} from '@/lib/campus-seven/program'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type ApplyBody = {
  submittedName?: unknown
  dateOfBirth?: unknown
  preferenceAnswers?: unknown
  requiredConsents?: unknown
  cardSalePreference?: unknown
}

const REQUIRED_CONSENTS = [
  'adult_eligibility',
  'seven_day_schedule',
  'activity_budget',
  'public_venues_no_alcohol',
  'external_contact_prohibited',
  'cohort_photo_display',
  'attendance_photo',
  'final_contact_reveal',
  'privacy_policy',
] as const

export async function POST(req: NextRequest) {
  const feature = getCampusSevenFeatureState()
  if (!feature.visible) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!feature.applicationsOpen) {
    return NextResponse.json({ error: 'applications_closed' }, { status: 403 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req) as ApplyBody
  const submittedName = typeof body.submittedName === 'string' ? body.submittedName.trim() : ''
  const dateOfBirth = typeof body.dateOfBirth === 'string' ? body.dateOfBirth : ''
  const preferenceAnswers = normalizeAnswers(body.preferenceAnswers)
  const requiredConsents = normalizeConsents(body.requiredConsents)

  if (submittedName.length < 2 || submittedName.length > 50) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 })
  }
  if (!isAdultOnDate(dateOfBirth, new Date().toISOString().slice(0, 10))) {
    return NextResponse.json({ error: 'adult_only' }, { status: 400 })
  }
  if (!preferenceAnswers) {
    return NextResponse.json({ error: 'invalid_preference_answers' }, { status: 400 })
  }
  if (!requiredConsents) {
    return NextResponse.json({ error: 'required_consent_missing' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('apply_to_campus_seven', {
    p_submitted_name: submittedName,
    p_date_of_birth: dateOfBirth,
    p_preference_answers: preferenceAnswers,
    p_required_consents: requiredConsents,
    p_card_sale_preference: body.cardSalePreference === true,
    p_consent_version: 'campus-seven-v3',
  })

  if (error) {
    const code = translateApplicationError(error.message)
    const status = code === 'application_locked' ? 409
        : code === 'program_setup_required' ? 503
          : 400
    return NextResponse.json({ error: code }, { status })
  }

  return NextResponse.json({ applicationId: data, status: 'identity_review' }, { status: 201 })
}

function normalizeAnswers(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const expectedIds = CAMPUS_SEVEN_PREFERENCE_QUESTIONS.map((question) => question.id)
  if (Object.keys(input).length !== expectedIds.length) return null

  const answers: Record<string, string> = {}
  for (const id of expectedIds) {
    const answer = typeof input[id] === 'string' ? input[id].trim() : ''
    if (!answer || answer.length > 80 || containsProhibitedContact(answer)) return null
    answers[id] = answer
  }
  return answers
}

function normalizeConsents(value: unknown): Record<string, true> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (REQUIRED_CONSENTS.some((key) => input[key] !== true)) return null
  return Object.fromEntries(REQUIRED_CONSENTS.map((key) => [key, true])) as Record<string, true>
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function translateApplicationError(message = ''): string {
  const codes = [
    'complete_profile_required',
    'profile_photo_required',
    'adult_only',
    'invalid_name',
    'invalid_preference_answers',
    'required_consent_missing',
    'application_locked',
    'application_window_closed',
  ]
  const match = codes.find((code) => message.includes(code))
  if (match) return match
  if (message.includes('apply_to_campus_seven')) return 'program_setup_required'
  return 'application_failed'
}
