import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from './dev-auth'
import {
  buildMatchSetupStatus,
  type MatchSetupStatus,
  type MatchSetupStepKey,
} from './matching/match-setup-status'

export type DevMatchSetupStep = MatchSetupStepKey

export const DEV_MATCH_SETUP_COOKIES: Record<DevMatchSetupStep, string> = {
  personality: 'booting_dev_match_personality',
  schedule: 'booting_dev_match_schedule',
  preferences: 'booting_dev_match_preferences',
}

export type DevPreviewGroupStatus = 'forming' | 'ready' | 'in_pool'

export const DEV_PREVIEW_GROUP_STATUS_COOKIE = 'booting_dev_group_status'
export const DEV_PREVIEW_GROUP_SIZE_COOKIE = 'booting_dev_group_size'

const COOKIE_VALUE = '1'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const DEV_PREVIEW_GROUP_STATUSES = new Set<DevPreviewGroupStatus>(['forming', 'ready', 'in_pool'])

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

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const found = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
  return found ? decodeURIComponent(found.slice(prefix.length)) : null
}

function writeDevPreviewCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function setDevPreviewGroupStatus(status: DevPreviewGroupStatus): boolean {
  if (!isDevPreviewClientSession()) return false
  writeDevPreviewCookie(DEV_PREVIEW_GROUP_STATUS_COOKIE, status)
  try {
    window.localStorage.setItem(DEV_PREVIEW_GROUP_STATUS_COOKIE, status)
  } catch {
    // Cookie persistence is enough for the preview flow.
  }
  return true
}

export function getDevPreviewGroupStatusFromClient(): DevPreviewGroupStatus {
  if (!isDevPreviewClientSession()) return 'forming'
  const stored = readCookieValue(DEV_PREVIEW_GROUP_STATUS_COOKIE)
  const fallback = (() => {
    try {
      return window.localStorage.getItem(DEV_PREVIEW_GROUP_STATUS_COOKIE)
    } catch {
      return null
    }
  })()
  const value = stored ?? fallback
  return DEV_PREVIEW_GROUP_STATUSES.has(value as DevPreviewGroupStatus)
    ? value as DevPreviewGroupStatus
    : 'forming'
}

export function setDevPreviewGroupSize(size: number): boolean {
  if (!isDevPreviewClientSession()) return false
  const normalized = size === 2 ? '2' : '3'
  writeDevPreviewCookie(DEV_PREVIEW_GROUP_SIZE_COOKIE, normalized)
  try {
    window.localStorage.setItem(DEV_PREVIEW_GROUP_SIZE_COOKIE, normalized)
  } catch {
    // Cookie persistence is enough for the preview flow.
  }
  return true
}

export function getDevPreviewGroupSizeFromClient(fallback: number): 2 | 3 {
  if (!isDevPreviewClientSession()) return fallback === 2 ? 2 : 3
  const stored = readCookieValue(DEV_PREVIEW_GROUP_SIZE_COOKIE)
  const fallbackStored = (() => {
    try {
      return window.localStorage.getItem(DEV_PREVIEW_GROUP_SIZE_COOKIE)
    } catch {
      return null
    }
  })()
  const value = stored ?? fallbackStored
  if (value === '2') return 2
  if (value === '3') return 3
  return fallback === 2 ? 2 : 3
}

function hasDevMatchSetupCookie(step: DevMatchSetupStep): boolean {
  if (typeof document === 'undefined') return false
  const expected = `${DEV_MATCH_SETUP_COOKIES[step]}=${COOKIE_VALUE}`
  return document.cookie
    .split(';')
    .some((cookie) => cookie.trim() === expected)
}

export function getDevMatchSetupStatusFromClient(): MatchSetupStatus {
  if (!isDevPreviewClientSession()) {
    return buildMatchSetupStatus({
      personality: false,
      schedule: false,
      preferences: false,
    })
  }

  return buildMatchSetupStatus({
    personality: hasDevMatchSetupCookie('personality'),
    schedule: hasDevMatchSetupCookie('schedule'),
    preferences: hasDevMatchSetupCookie('preferences'),
  })
}
