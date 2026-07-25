'use client'

import { useEffect, useState } from 'react'
import { BellOff, BellRing, Loader2 } from 'lucide-react'

type PushState = 'checking' | 'off' | 'on' | 'busy' | 'blocked' | 'unsupported' | 'unavailable'

export default function CampusSevenPushControl() {
  const [state, setState] = useState<PushState>('checking')
  const [publicKey, setPublicKey] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void checkCurrentState().then((result) => {
      if (!active) return
      setState(result.state)
      setPublicKey(result.publicKey)
    })
    return () => { active = false }
  }, [])

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
      const registration = await navigator.serviceWorker.register('/campus-seven-sw.js')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKey),
      })
      const synced = await syncSubscription(subscription)
      if (!synced) {
        await subscription.unsubscribe()
        throw new Error('실시간 알림을 켜지 못했어요.')
      }
      setState('on')
      setMessage('실시간 알림이 켜졌어요.')
    } catch (error) {
      setState('off')
      setMessage(error instanceof Error ? error.message : '실시간 알림을 켜지 못했어요.')
    }
  }

  async function disable() {
    if (state === 'busy') return
    setState('busy')
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/campus-seven/push/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
      }
      setState('off')
      setMessage('실시간 알림 구독을 해제했어요.')
    } catch {
      setState('on')
      setMessage('구독 해제를 완료하지 못했어요.')
    }
  }

  if (state === 'unsupported' || state === 'unavailable') return null

  const enabled = state === 'on'
  const busy = state === 'checking' || state === 'busy'

  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border border-boot-hairline bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-black text-boot-primary">실시간 안내</p>
        <p className="mt-0.5 text-sm font-black text-boot-ink">
          {state === 'blocked' ? '브라우저 알림이 차단됐어요' : enabled ? '알림 받는 중' : '알림 꺼짐'}
        </p>
        {message && <p role="status" className="mt-1 text-[11px] font-bold text-boot-muted">{message}</p>}
      </div>
      <button
        type="button"
        onClick={() => void (enabled ? disable() : enable())}
        disabled={busy || state === 'blocked'}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-boot-hairline bg-white px-3 text-xs font-black text-boot-body disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="animate-spin" size={16} /> : enabled ? <BellOff size={16} /> : <BellRing size={16} />}
        {enabled ? '구독 해제' : '알림 켜기'}
      </button>
    </section>
  )
}

async function checkCurrentState(): Promise<{ state: PushState; publicKey: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { state: 'unsupported', publicKey: '' }
  }
  try {
    const response = await fetch('/api/campus-seven/push/config', { cache: 'no-store' })
    const payload = await response.json() as { enabled?: boolean; publicKey?: string }
    if (!response.ok || payload.enabled !== true || !payload.publicKey) {
      return { state: 'unavailable', publicKey: '' }
    }
    if (Notification.permission === 'denied') {
      return { state: 'blocked', publicKey: payload.publicKey }
    }
    const registration = await navigator.serviceWorker.getRegistration()
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
  const response = await fetch('/api/campus-seven/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })
  return response.ok
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const bytes = window.atob(base64)
  const buffer = new ArrayBuffer(bytes.length)
  const output = new Uint8Array(buffer)
  for (let index = 0; index < bytes.length; index += 1) {
    output[index] = bytes.charCodeAt(index)
  }
  return buffer
}
