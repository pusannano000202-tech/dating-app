export interface MatchDetail {
  match_id: string
  match_mode?: 'group' | 'solo'
  my_group_id: string
  opp_group_id: string
  opp_group_size: number
  opp_group_gender: 'male' | 'female' | 'mixed'
  match_status: string
  matched_at: string
  confirmed_at: string | null
  completed_at: string | null
  my_confirmed_at: string | null
  opp_confirmed_at: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  venue_name: string | null
  venue_address: string | null
  venue_map_url: string | null
  my_card_submitted_at: string | null
  my_card_content_text: string | null
  my_group_active_count: number
  my_group_card_submitted_count: number
  my_group_deposit_paid_count: number
  my_group_ready: boolean
  opp_group_active_count: number
  opp_group_card_submitted_count: number
  opp_group_deposit_paid_count: number
  opp_group_ready: boolean
}

export function isMatchDetailPayload(value: unknown): value is { match: MatchDetail } {
  if (!isRecord(value) || !isRecord(value.match)) return false

  const match = value.match
  return typeof match.match_id === 'string'
    && (
      match.match_mode === undefined
      || match.match_mode === 'group'
      || match.match_mode === 'solo'
    )
    && typeof match.my_group_id === 'string'
    && typeof match.opp_group_id === 'string'
    && isGroupSize(match.opp_group_size)
    && (
      match.opp_group_gender === 'male'
      || match.opp_group_gender === 'female'
      || match.opp_group_gender === 'mixed'
    )
    && typeof match.match_status === 'string'
    && typeof match.matched_at === 'string'
    && isNullableString(match.confirmed_at)
    && isNullableString(match.completed_at)
    && isNullableString(match.my_confirmed_at)
    && isNullableString(match.opp_confirmed_at)
    && isNullableString(match.scheduled_start)
    && isNullableString(match.scheduled_end)
    && isNullableString(match.venue_name)
    && isNullableString(match.venue_address)
    && isNullableString(match.venue_map_url)
    && isNullableString(match.my_card_submitted_at)
    && isNullableString(match.my_card_content_text)
    && isCount(match.my_group_active_count)
    && isCount(match.my_group_card_submitted_count)
    && isCount(match.my_group_deposit_paid_count)
    && typeof match.my_group_ready === 'boolean'
    && isCount(match.opp_group_active_count)
    && isCount(match.opp_group_card_submitted_count)
    && isCount(match.opp_group_deposit_paid_count)
    && typeof match.opp_group_ready === 'boolean'
}

function isGroupSize(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
