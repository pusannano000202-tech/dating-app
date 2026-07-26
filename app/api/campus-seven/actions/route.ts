import { NextRequest, NextResponse } from 'next/server'
import {
  CAMPUS_SEVEN_GAMES,
  containsProhibitedContact,
  getCampusSevenFeatureState,
} from '@/lib/campus-seven/program'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type ActionBody = Record<string, unknown> & { action?: unknown }

export async function POST(req: NextRequest) {
  const feature = getCampusSevenFeatureState()
  if (!feature.visible) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req) as ActionBody
  let result: Awaited<ReturnType<typeof supabase.rpc>>

  switch (body.action) {
    case 'day_two_choices': {
      const targetUserIds = uuidArray(body.targetUserIds, 2)
      if (!targetUserIds) return badRequest('invalid_targets')
      result = await supabase.rpc('submit_campus_seven_day_two_choices', {
        p_target_user_ids: targetUserIds,
      })
      break
    }
    case 'reservation': {
      const scheduleId = uuid(body.scheduleId)
      const status = string(body.status)
      if (!scheduleId || !['confirmed', 'venue_unavailable', 'substitute_requested'].includes(status)) {
        return badRequest('invalid_reservation_action')
      }
      result = await supabase.rpc('update_campus_seven_reservation_task', {
        p_schedule_id: scheduleId,
        p_status: status,
        p_confirmation_reference: optionalString(body.confirmationReference, 120),
      })
      break
    }
    case 'attendance': {
      const scheduleId = uuid(body.scheduleId)
      const objectPath = string(body.objectPath)
      const capturedAt = isoDateTime(body.capturedAt)
      const watermarkText = string(body.watermarkText)
      if (!scheduleId || !objectPath || !capturedAt || !watermarkText) return badRequest('invalid_attendance')
      result = await supabase.rpc('submit_campus_seven_attendance', {
        p_schedule_id: scheduleId,
        p_object_path: objectPath,
        p_captured_at: capturedAt,
        p_watermark_text: watermarkText,
      })
      break
    }
    case 'interest_vote': {
      const dayNumber = Number(body.dayNumber)
      const targetUserId = uuid(body.targetUserId)
      const positiveReason = string(body.positiveReason).trim()
      if (![1, 3, 5].includes(dayNumber) || !targetUserId || positiveReason.length < 2
        || positiveReason.length > 60 || containsProhibitedContact(positiveReason)) {
        return badRequest('invalid_interest_vote')
      }
      result = await supabase.rpc('submit_campus_seven_interest_vote', {
        p_day_number: dayNumber,
        p_target_user_id: targetUserId,
        p_positive_reason: positiveReason,
      })
      break
    }
    case 'game_rank': {
      const gameName = string(body.gameName)
      const rank = Number(body.rank)
      if (!CAMPUS_SEVEN_GAMES.some((game) => game === gameName) || !Number.isInteger(rank) || rank < 1 || rank > 4) {
        return badRequest('invalid_game_rank')
      }
      result = await supabase.rpc('submit_campus_seven_game_rank', {
        p_game_name: gameName,
        p_rank: rank,
      })
      break
    }
    case 'date_choice': {
      const targetUserId = uuid(body.targetUserId)
      if (!targetUserId) return badRequest('invalid_target')
      result = await supabase.rpc('submit_campus_seven_date_choice', { p_target_user_id: targetUserId })
      break
    }
    case 'date_response': {
      const choiceId = uuid(body.choiceId)
      if (!choiceId || typeof body.accept !== 'boolean') return badRequest('invalid_date_response')
      result = await supabase.rpc('respond_campus_seven_date_choice', {
        p_choice_id: choiceId,
        p_accept: body.accept,
      })
      break
    }
    case 'final_proposal': {
      const targetUserId = uuid(body.targetUserId)
      if (!targetUserId) return badRequest('invalid_target')
      result = await supabase.rpc('submit_campus_seven_final_proposal', { p_target_user_id: targetUserId })
      break
    }
    case 'final_response': {
      const proposerUserId = uuid(body.proposerUserId)
      if (!proposerUserId || typeof body.accept !== 'boolean') return badRequest('invalid_final_response')
      result = await supabase.rpc('respond_campus_seven_final_proposal', {
        p_proposer_user_id: proposerUserId,
        p_accept: body.accept,
      })
      break
    }
    case 'safety_report': {
      const targetUserId = body.targetUserId == null ? null : uuid(body.targetUserId)
      const category = string(body.category)
      const detail = string(body.detail).trim()
      const allowedCategories = ['harassment', 'stalking', 'contact_request', 'threat', 'intoxication', 'emergency', 'other']
      if ((body.targetUserId != null && !targetUserId) || !allowedCategories.includes(category)
        || detail.length < 2 || detail.length > 1000) {
        return badRequest('invalid_safety_report')
      }
      result = await supabase.rpc('submit_campus_seven_safety_report', {
        p_target_user_id: targetUserId,
        p_category: category,
        p_detail: detail,
        p_safety_exit_requested: body.safetyExitRequested === true,
      })
      break
    }
    case 'deposit_appeal': {
      const reviewId = uuid(body.reviewId)
      const appealText = string(body.appealText).trim()
      if (!reviewId || appealText.length < 2 || appealText.length > 1000) {
        return badRequest('invalid_deposit_appeal')
      }
      result = await supabase.rpc('appeal_campus_seven_deposit_review', {
        p_review_id: reviewId,
        p_appeal_text: appealText,
      })
      break
    }
    case 'card_publication': {
      if (typeof body.saleEnabled !== 'boolean') return badRequest('invalid_card_publication')
      if (body.saleEnabled && !feature.cardPaymentsEnabled) return badRequest('card_payments_disabled')
      result = await supabase.rpc('set_campus_seven_card_publication', {
        p_sale_enabled: body.saleEnabled,
        p_consent_version: 'campus-seven-card-sale-v1',
      })
      break
    }
    case 'card_view': {
      const ownerUserId = uuid(body.ownerUserId)
      if (!ownerUserId) return badRequest('invalid_card_owner')
      result = await supabase.rpc('get_campus_seven_card', { p_owner_user_id: ownerUserId })
      break
    }
    default:
      return badRequest('invalid_action')
  }

  if (result.error) {
    return NextResponse.json({ error: translateActionError(result.error.message) }, { status: 400 })
  }
  return NextResponse.json({ data: result.data })
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

function uuidArray(value: unknown, length: number): string[] | null {
  if (!Array.isArray(value) || value.length !== length) return null
  const values = value.map(uuid)
  if (values.some((entry) => !entry) || new Set(values).size !== length) return null
  return values as string[]
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalString(value: unknown, maxLength: number): string | null {
  const result = string(value).trim()
  return result ? result.slice(0, maxLength) : null
}

function isoDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  return new Date(value).toISOString()
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function translateActionError(message = ''): string {
  const knownCodes = [
    'active_enrollment_required', 'newcomer_only', 'day_two_choice_closed',
    'reservation_task_not_found', 'reservation_task_locked', 'interest_vote_closed',
    'day_four_team_required', 'game_rank_window_closed', 'game_rank_locked',
    'invalid_interest_target', 'date_choice_right_required', 'participant_already_has_special_date',
    'day_six_choice_closed', 'date_response_window_closed',
    'final_proposal_window_closed', 'final_response_window_closed', 'final_proposal_not_found', 'completed_enrollment_required',
    'deposit_review_not_found', 'deposit_review_not_appealable', 'deposit_review_appeal_expired',
    'active_card_purchase_required', 'same_cohort_required',
  ]
  return knownCodes.find((code) => message.includes(code)) ?? 'action_failed'
}
