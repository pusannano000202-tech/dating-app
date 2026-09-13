import type { DailyIdentity } from './contract'

export type DailyIdentityCardState =
  | Readonly<{ status: 'hidden'; identity?: undefined }>
  | Readonly<{ status: 'loading'; identity?: undefined }>
  | Readonly<{ status: 'error'; identity?: undefined }>
  | Readonly<{ status: 'ready'; identity: DailyIdentity }>

export type DailyIdentityCardAction =
  | Readonly<{ type: 'reveal' }>
  | Readonly<{ type: 'resolved'; identity: DailyIdentity }>
  | Readonly<{ type: 'failed' }>
  | Readonly<{ type: 'privacy-reset' }>

export const initialDailyIdentityCardState: DailyIdentityCardState = Object.freeze({ status: 'hidden' })

export function dailyIdentityCardReducer(
  state: DailyIdentityCardState,
  action: DailyIdentityCardAction,
): DailyIdentityCardState {
  switch (action.type) {
    case 'reveal': return state.status === 'loading' ? state : { status: 'loading' }
    case 'resolved': return { status: 'ready', identity: action.identity }
    case 'failed': return { status: 'error' }
    case 'privacy-reset': return initialDailyIdentityCardState
  }
}

export function seoulLocalDate(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_daily_identity_time')
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function nextSeoulMidnightDelay(now: Date = new Date()): number {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_daily_identity_time')
  const seoulNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const nextMidnightUtc = Date.UTC(
    seoulNow.getUTCFullYear(),
    seoulNow.getUTCMonth(),
    seoulNow.getUTCDate() + 1,
  ) - 9 * 60 * 60 * 1000
  return Math.max(0, nextMidnightUtc - now.getTime())
}
