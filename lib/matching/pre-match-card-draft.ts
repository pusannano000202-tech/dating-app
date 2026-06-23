export const PRE_MATCH_CARD_DRAFT_COOKIE = 'booting_pre_match_card_draft'
export const PRE_MATCH_CARD_DRAFT_VALUE = 'done'

export function isPreMatchCardDraftCookieDone(value?: string | null): boolean {
  return value === PRE_MATCH_CARD_DRAFT_VALUE
}

export function getPreMatchCardDraftCookie(): string {
  return `${PRE_MATCH_CARD_DRAFT_COOKIE}=${PRE_MATCH_CARD_DRAFT_VALUE}; path=/; max-age=604800; SameSite=Lax`
}
