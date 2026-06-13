import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from './dev-auth'

export type DevMatchSetupStep = 'personality' | 'schedule' | 'preferences'

export const DEV_MATCH_SETUP_COOKIES: Record<DevMatchSetupStep, string> = {
  personality: 'booting_dev_match_personality',
  schedule: 'booting_dev_match_schedule',
  preferences: 'booting_dev_match_preferences',
}

const COOKIE_VALUE = '1'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export function getDevMatchSetupCookieValue(): string {
  return COOKIE_VALUE
}

function hasDevAuthLocalStorage(): boolean {
  try {
    return window.localStorage.getItem(DEV_AUTH_COOKIE) === getDevAuthCookieValue()
  } catch {
    return false
  }
}

function hasDevAuthCookie(): boolean {
  const expected = `${DEV_AUTH_COOKIE}=${getDevAuthCookieValue()}`
  return document.cookie
    .split(';')
    .some((cookie) => cookie.trim() === expected)
}

export function isDevPreviewClientSession(): boolean {
  if (typeof window === 'undefined') return false
  return isDevAuthBypassEnabled() && (hasDevAuthLocalStorage() || hasDevAuthCookie())
}

export function markDevMatchSetupStepComplete(step: DevMatchSetupStep): boolean {
  if (!isDevPreviewClientSession()) return false
  document.cookie = `${DEV_MATCH_SETUP_COOKIES[step]}=${COOKIE_VALUE}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  return true
}
