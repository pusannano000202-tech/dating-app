'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BellOff, BellRing, Loader2, RefreshCw } from 'lucide-react'

import { TONIGHT_PUSH_CONSENT_VERSION } from '@/lib/notifications/tonight-contract'

type PushState = 'checking' | 'off' | 'on' | 'busy' | 'blocked' | 'unsupported' | 'unavailable'

const TONIGHT_PUSH_SCOPE = '/tonight-notifications/'

export default function TonightNotificationControl({
  audience,
  onRefresh,
}: {
  audience: 'participant' | 'partner'
  onRefresh: () => void | Promise<void>
}) {
  const [state, setState] = useState<PushState>('checking')
  const [publicKey, setPublicKey] = useState('')
  const [message, setMessage] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const refreshRef = useRef(onRefresh)

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  const refresh = useCallback(async (announce: boolean) => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refreshRef.current()
      if (announce) setMessage('최신 진행 상태를 확인했어요.')
    } catch {
      if (announce) setMessage('진행 상태를 새로고침하지 못했어요.')
    } finally {
      setRefreshing(false)
    }
  }, [refreshing])

  useEffect(() => {
    let active = true
    void checkCurrentState().then((result) => {
      if (!active) return
      setState(result.state)
      setPublicKey(result.publicKey)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh(false)
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    const intervalId = window.setInterval(refreshWhenVisible, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.clearInterval(intervalId)
    }
  }, [refresh])

  async function enable() {
    if (state === 'busy' || !publicKey) return
    setState('busy')
    setMessage('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const registration = await navigator.serviceWorker.register('/tonight-sw.js', {
        scope: TONIGHT_PUSH_SCOPE,
      })
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKey),
      })
      const synced = await syncSubscription(subscription)
      if (!synced) {
        await subscription.unsubscribe()
        throw new Error('오늘밤 실시간 알림을 켜지 못했어요.')
      }
      setState('on')
      setMessage('이 기기에서 오늘밤 실시간 알림을 받을게요.')
    } catch (error) {
      setState('off')
      setMessage(error instanceof Error ? error.message : '오늘밤 실시간 알림을 켜지 못했어요.')
    }
  }

  async function disable() {
    if (state === 'busy') return
    setState('busy')
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration(TONIGHT_PUSH_SCOPE)
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const response = await fetch('/api/tonight/notifications/push/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        if (!response.ok) throw new Error('구독 해제를 완료하지 못했어요.')
        await subscription.unsubscribe()
      }
      setState('off')
      setMessage('이 기기의 오늘밤 알림을 해제했어요.')
    } catch (error) {
      setState('on')
      setMessage(error instanceof Error ? error.message : '구독 해제를 완료하지 못했어요.')
    }
  }

  const enabled = state === 'on'
  const busy = state === 'checking' || state === 'busy'
  const label = audience === 'partner' ? '업장 수락·운영 알림' : '팀 편성·결제·장소 알림'

  return (
    <section className="mt-4 rounded-2xl border border-[#ead9d2] bg-white p-4" aria-labelledby={`tonight-notification-${audience}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p id={`tonight-notification-${audience}`} className="text-xs font-black tracking-[0.1em] text-[#b94b3f]">놓치지 않는 오늘밤 진행</p>
          <p className="mt-1 text-sm font-black text-[#292321]">{label}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#776b66]">
            앱 화면은 30초마다 갱신해요. 푸시는 명시적으로 켠 이 기기에서만 전송되며, 알림에는 이름·연락처·정확한 업장 주소를 넣지 않아요.
          </p>
          {state === 'blocked' && <p className="mt-1 text-xs font-bold text-rose-700">브라우저 설정에서 알림 차단을 먼저 해제해 주세요.</p>}
          {state === 'unsupported' && <p className="mt-1 text-xs font-bold text-[#776b66]">이 브라우저에서는 푸시를 지원하지 않지만 화면 자동 갱신은 계속돼요.</p>}
          {state === 'unavailable' && <p className="mt-1 text-xs font-bold text-[#776b66]">푸시 배포 설정 전이라 화면 자동 갱신으로 안내해요.</p>}
          {message && <p role="status" className="mt-1 text-xs font-bold text-[#776b66]">{message}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black text-[#292321] disabled:opacity-40"
          >
            <RefreshCw className={refreshing ? 'animate-spin' : ''} size={16} aria-hidden />
            지금 새로고침
          </button>
          {state !== 'unsupported' && state !== 'unavailable' && (
            <button
              type="button"
              onClick={() => void (enabled ? disable() : enable())}
              disabled={busy || state === 'blocked'}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="animate-spin" size={16} aria-hidden /> : enabled ? <BellOff size={16} aria-hidden /> : <BellRing size={16} aria-hidden />}
              {enabled ? '알림 끄기' : '알림 켜기'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

async function checkCurrentState(): Promise<{ state: PushState; publicKey: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { state: 'unsupported', publicKey: '' }
  }
  try {
    const response = await fetch('/api/tonight/notifications/push/config', { cache: 'no-store' })
    const payload = await response.json() as { enabled?: boolean; publicKey?: string }
    if (!response.ok || payload.enabled !== true || !payload.publicKey) {
      return { state: 'unavailable', publicKey: '' }
    }
    if (Notification.permission === 'denied') {
      return { state: 'blocked', publicKey: payload.publicKey }
    }
    const registration = await navigator.serviceWorker.getRegistration(TONIGHT_PUSH_SCOPE)
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return { state: 'off', publicKey: payload.publicKey }
    const synced = await syncSubscription(subscription)
    if (!synced) await subscription.unsubscribe()
    return { state: synced ? 'on' : 'off', publicKey: payload.publicKey }
  } catch {
    return { state: 'unavailable', publicKey: '' }
  }
}

async function syncSubscription(subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false
  const response = await fetch('/api/tonight/notifications/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      consentVersion: TONIGHT_PUSH_CONSENT_VERSION,
    }),
  })
  return response.ok
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const bytes = window.atob(base64)
  const output = new Uint8Array(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) output[index] = bytes.charCodeAt(index)
  return output.buffer
}
