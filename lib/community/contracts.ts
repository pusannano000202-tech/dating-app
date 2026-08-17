export const MEETUP_CATEGORIES = [
  'baseball',
  'soccer',
  'basketball',
  'badminton',
  'tennis',
  'running',
  'board_game',
  'gaming',
  'hiking',
  'walking',
  'dining',
  'study',
  'other',
] as const

export type MeetupCategory = (typeof MEETUP_CATEGORIES)[number]

export const COMMUNITY_CATEGORIES = [
  'feedback',
  'meetup-review',
  'relationship-advice',
  'relationship-coach',
] as const

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]

export type MeetupCreateInput = {
  category: MeetupCategory
  title: string
  description: string
  placeName: string
  scheduledAt: string
  capacity: number
}

export type CommunityPostInput = {
  category: CommunityCategory
  title: string
  body: string
  meetupId: string | null
}

export type CommunityCommentInput = {
  body: string
  parentCommentId?: string
}

export const COMMUNITY_REACTIONS = ['like', 'dislike'] as const

export type CommunityReaction = (typeof COMMUNITY_REACTIONS)[number]

export type CommunityReactionInput = {
  reaction: CommunityReaction
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n') : ''
}

export function parseCommunityListLimit(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 30
  return Math.max(1, Math.min(Number(value), 30))
}

export function isMeetupCategory(value: unknown): value is MeetupCategory {
  return typeof value === 'string' && MEETUP_CATEGORIES.includes(value as MeetupCategory)
}

export function isCommunityCategory(value: unknown): value is CommunityCategory {
  return typeof value === 'string' && COMMUNITY_CATEGORIES.includes(value as CommunityCategory)
}

export function validateMeetupCreateInput(
  input: unknown,
  now = new Date(),
): ValidationResult<MeetupCreateInput> {
  if (!isRecord(input)) return { ok: false, error: 'invalid_request' }

  const category = input.category
  const title = cleanText(input.title)
  const description = cleanText(input.description)
  const placeName = cleanText(input.place_name)
  const capacity = typeof input.capacity === 'number' ? input.capacity : Number(input.capacity)
  const scheduledAt = cleanText(input.scheduled_at)
  const scheduledDate = new Date(scheduledAt)

  if (!isMeetupCategory(category)) return { ok: false, error: 'invalid_category' }
  if (title.length < 4 || title.length > 60) return { ok: false, error: 'invalid_title' }
  if (description.length > 500) return { ok: false, error: 'invalid_description' }
  if (placeName.length < 2 || placeName.length > 80) return { ok: false, error: 'invalid_place' }
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 20) {
    return { ok: false, error: 'invalid_capacity' }
  }
  if (!scheduledAt || Number.isNaN(scheduledDate.getTime())) {
    return { ok: false, error: 'invalid_schedule' }
  }
  if (scheduledDate.getTime() < now.getTime() + 30 * 60 * 1000) {
    return { ok: false, error: 'schedule_too_soon' }
  }

  return {
    ok: true,
    value: {
      category,
      title,
      description,
      placeName,
      scheduledAt: scheduledDate.toISOString(),
      capacity,
    },
  }
}

export function validateCommunityPostInput(input: unknown): ValidationResult<CommunityPostInput> {
  if (!isRecord(input)) return { ok: false, error: 'invalid_request' }

  const category = input.category
  const title = cleanText(input.title)
  const body = cleanText(input.body)
  const meetupId = cleanText(input.meetup_id)

  if (!isCommunityCategory(category)) return { ok: false, error: 'invalid_category' }
  if (title.length < COMMUNITY_POST_TITLE_MIN || title.length > COMMUNITY_POST_TITLE_MAX) {
    return { ok: false, error: 'invalid_title' }
  }
  if (body.length < COMMUNITY_POST_BODY_MIN || body.length > COMMUNITY_POST_BODY_MAX) {
    return { ok: false, error: 'invalid_body' }
  }
  if (category === 'meetup-review' && !isUuid(meetupId)) {
    return { ok: false, error: 'invalid_meetup' }
  }
  if (category !== 'meetup-review' && meetupId) {
    return { ok: false, error: 'invalid_meetup' }
  }

  return { ok: true, value: { category, title, body, meetupId: meetupId || null } }
}

export function validateCommunityCommentInput(input: unknown): ValidationResult<CommunityCommentInput> {
  if (!isRecord(input)) return { ok: false, error: 'invalid_request' }

  const body = cleanText(input.body)
  const parentCommentId = cleanText(input.parent_comment_id)
  if (body.length < COMMUNITY_COMMENT_BODY_MIN || body.length > COMMUNITY_COMMENT_BODY_MAX) {
    return { ok: false, error: 'invalid_comment' }
  }
  if (parentCommentId && !isUuid(parentCommentId)) {
    return { ok: false, error: 'invalid_parent_comment' }
  }

  return {
    ok: true,
    value: parentCommentId ? { body, parentCommentId } : { body },
  }
}

export function validateCommunityReactionInput(input: unknown): ValidationResult<CommunityReactionInput> {
  if (!isRecord(input)) return { ok: false, error: 'invalid_request' }

  const reaction = input.reaction
  if (typeof reaction !== 'string' || !COMMUNITY_REACTIONS.includes(reaction as CommunityReaction)) {
    return { ok: false, error: 'invalid_reaction' }
  }

  return { ok: true, value: { reaction: reaction as CommunityReaction } }
}

export const COMMUNITY_POST_TITLE_MIN = 4
export const COMMUNITY_POST_TITLE_MAX = 80
export const COMMUNITY_POST_BODY_MIN = 10
export const COMMUNITY_POST_BODY_MAX = 2000
export const COMMUNITY_COMMENT_BODY_MIN = 1
export const COMMUNITY_COMMENT_BODY_MAX = 500

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
