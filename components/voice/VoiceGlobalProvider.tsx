'use client'

import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { Headphones, LoaderCircle, Mic, MicOff, PhoneOff, RotateCw, X } from 'lucide-react'
import type { Room, RemoteTrack } from 'livekit-client'
import { createClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/utils'
import { VOICE_ERROR_COPY, voiceCommand, voiceFetch } from '@/lib/voice/client'
import type { VoiceCommand } from '@/lib/voice/contracts'
import { getVoiceConnectErrorMessage } from '@/lib/voice/media-lifecycle'
import { cleanVoiceBeforeSignOut } from '@/lib/voice/signout-cleanup'
import {
  constrainVoiceDockPosition,
  moveVoiceDockByKeyboard,
  parseVoiceGlobalRuntime,
  type VoiceDockPoint,
  type VoiceGlobalRuntime,
} from '@/lib/voice/global-runtime'
import s from './voice-global.module.css'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting'
type RuntimePhase = 'loading' | 'ready' | 'inactive' | 'error'

type VoiceGlobalContextValue = {
  runtime: VoiceGlobalRuntime | null
  phase: RuntimePhase
  error: string
  busy: boolean
  connection: ConnectionState
  mic: boolean
  inputLevel: number
  speakers: string[]
  refresh: () => Promise<VoiceGlobalRuntime | null>
  cancelWaiting: () => Promise<void>
  sessionCommand: (action: VoiceCommand['action'], extra?: Partial<VoiceCommand>) => Promise<VoiceGlobalRuntime | null>
  connect: () => Promise<void>
  toggleMic: () => Promise<void>
  disconnectLocal: () => Promise<void>
  openVoiceSession: () => Promise<void>
}

const VoiceGlobalContext = createContext<VoiceGlobalContextValue | null>(null)
const DOCK_SIZE = 64
const BOTTOM_INSET = 88

export const VOICE_BEFORE_SIGN_OUT_EVENT = 'quantum:voice-before-sign-out'

type VoiceBeforeSignOutDetail = {
  complete: (cleanup: Promise<unknown>) => void
}

export async function requestVoiceCleanupBeforeSignOut(): Promise<void> {
  if (typeof window === 'undefined') return
  await new Promise<void>((resolve) => {
    let handled = false
    const timeout = window.setTimeout(resolve, 4000)
    const detail: VoiceBeforeSignOutDetail = {
      complete: (cleanup) => {
        if (handled) return
        handled = true
        const finish = () => {
          window.clearTimeout(timeout)
          resolve()
        }
        void cleanup.then(finish, finish)
      },
    }
    window.dispatchEvent(new CustomEvent(VOICE_BEFORE_SIGN_OUT_EVENT, { detail }))
    if (!handled) {
      window.clearTimeout(timeout)
      resolve()
    }
  })
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function initialDockPosition(): VoiceDockPoint {
  return { x: 16, y: 96 }
}

export function useVoiceGlobal() {
  const context = useContext(VoiceGlobalContext)
  if (!context) throw new Error('VoiceGlobalProvider가 앱 전역에 필요합니다.')
  return context
}

export default function VoiceGlobalProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [runtime, setRuntime] = useState<VoiceGlobalRuntime | null>(null)
  const [phase, setPhase] = useState<RuntimePhase>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [mic, setMic] = useState(false)
  const [inputLevel, setInputLevel] = useState(0)
  const [speakers, setSpeakers] = useState<string[]>([])
  const runtimeRef = useRef<VoiceGlobalRuntime | null>(null)
  const busyRef = useRef(false)
  const operationSequence = useRef(0)
  const pendingOperation = useRef<Promise<void> | null>(null)
  const signingOut = useRef(false)
  const signOutTask = useRef<Promise<void> | null>(null)
  const requestSequence = useRef(0)
  const refreshController = useRef<AbortController | null>(null)
  const accountId = useRef<string | null>(null)
  const roomRef = useRef<Room | null>(null)
  const roomSessionId = useRef<string | null>(null)
  const audioRoot = useRef<HTMLDivElement | null>(null)
  const meterFrame = useRef<number | null>(null)
  const notifiedOffer = useRef<string | null>(null)
  const mounted = useRef(true)

  const publishRuntime = useCallback((next: VoiceGlobalRuntime | null) => {
    runtimeRef.current = next
    setRuntime(next)
  }, [])

  const stopInputMeter = useCallback(() => {
    if (meterFrame.current !== null) cancelAnimationFrame(meterFrame.current)
    meterFrame.current = null
    if (mounted.current) setInputLevel(0)
  }, [])

  const disconnectLocal = useCallback(async () => {
    stopInputMeter()
    const active = roomRef.current
    roomRef.current = null
    roomSessionId.current = null
    if (active) await active.disconnect().catch(() => undefined)
    if (!mounted.current || roomRef.current) return
    setConnection('idle')
    setMic(false)
    setSpeakers([])
    audioRoot.current?.replaceChildren()
  }, [stopInputMeter])

  const notifyOffer = useCallback((next: VoiceGlobalRuntime) => {
    const sessionId = next.session?.id
    if (
      next.status !== 'offered' ||
      next.session?.state !== 'proposed' ||
      !sessionId ||
      notifiedOffer.current === sessionId
    ) return
    notifiedOffer.current = sessionId
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const notice = new Notification('대화 요청이 도착했어요', {
      body: '앱에서 요청을 확인해 주세요.',
      tag: `quantum-voice-offer-${sessionId}`,
    })
    notice.onclick = () => {
      window.focus()
      void (async () => {
        const latest = await refreshRef.current()
        if (latest?.session?.id === sessionId && latest.status === 'offered')
          router.push(`/community/voice/session/${sessionId}`)
      })()
      notice.close()
    }
  }, [router])

  const refreshRef = useRef<() => Promise<VoiceGlobalRuntime | null>>(async () => null)
  const refresh = useCallback(async () => {
    refreshController.current?.abort()
    const controller = new AbortController()
    refreshController.current = controller
    const sequence = ++requestSequence.current
    try {
      const response = await fetch('/api/voice/runtime', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (sequence !== requestSequence.current || controller.signal.aborted) return runtimeRef.current
      if (response.status === 401 || response.status === 403) {
        await disconnectLocal()
        if (sequence !== requestSequence.current || controller.signal.aborted) return runtimeRef.current
        publishRuntime(null)
        setPhase('inactive')
        setError('')
        return null
      }
      const raw = await response.json().catch(() => null)
      if (!response.ok) throw new Error('보이스 상태를 불러오지 못했어요.')
      const next = parseVoiceGlobalRuntime(raw)
      if (sequence !== requestSequence.current || controller.signal.aborted) return runtimeRef.current
      const activeSessionId = roomSessionId.current
      if (activeSessionId && (activeSessionId !== next.session?.id || next.status === 'cleanup_required')) await disconnectLocal()
      if (sequence !== requestSequence.current || controller.signal.aborted) return runtimeRef.current
      publishRuntime(next)
      setPhase('ready')
      setError('')
      notifyOffer(next)
      return next
    } catch {
      if (controller.signal.aborted || sequence !== requestSequence.current) return runtimeRef.current
      setPhase(runtimeRef.current ? 'error' : 'inactive')
      setError(runtimeRef.current ? '보이스 상태를 불러오지 못했어요.' : '')
      return runtimeRef.current
    }
  }, [disconnectLocal, notifyOffer, publishRuntime])
  refreshRef.current = refresh

  const runBusy = useCallback(async <T,>(operation: (isCurrent: () => boolean) => Promise<T>) => {
    if (busyRef.current || signingOut.current) return null
    const sequence = ++operationSequence.current
    let finishOperation!: () => void
    const pending = new Promise<void>(resolve => { finishOperation = resolve })
    pendingOperation.current = pending
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      return await operation(() => sequence === operationSequence.current)
    } catch (caught) {
      if (sequence !== operationSequence.current) return null
      setError(caught instanceof Error ? caught.message : '요청을 처리하지 못했어요.')
      setPhase(runtimeRef.current ? 'error' : 'inactive')
      return null
    } finally {
      finishOperation()
      if (pendingOperation.current === pending) pendingOperation.current = null
      if (sequence === operationSequence.current) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }, [])

  const cancelWaiting = useCallback(async () => {
    await runBusy(async (isCurrent) => {
      const current = runtimeRef.current
      if (!current || current.status !== 'waiting') return
      const next = parseVoiceGlobalRuntime(await voiceFetch('/api/voice/runtime', {
        action: 'cancel_waiting',
        expectedRevision: current.revision,
        idempotencyKey: crypto.randomUUID(),
      }))
      if (!isCurrent()) return
      publishRuntime(next)
      setPhase('ready')
    })
  }, [publishRuntime, runBusy])

  const sessionCommand = useCallback(async (
    action: VoiceCommand['action'],
    extra: Partial<VoiceCommand> = {},
  ) => runBusy(async (isCurrent) => {
    const current = runtimeRef.current
    const session = current?.session
    const sessionId = session?.id ?? current?.cleanup?.sessionId
    const revision = session?.revision ?? current?.cleanup?.revision
    if (!sessionId || revision === undefined) return current ?? null
    if (current?.status === 'cleanup_required' && action !== 'leave') return null
    if (['leave', 'next', 'mode'].includes(action)) await disconnectLocal()
    if (!isCurrent()) return null
    if (action === 'next' && session?.adviceRole) {
      await voiceFetch('/api/voice/advice/next', {
        sessionId,
        idempotencyKey: crypto.randomUUID(),
      })
    } else {
      await voiceFetch(
        `/api/voice/sessions/${sessionId}`,
        voiceCommand(action, revision, extra),
      )
    }
    return isCurrent() ? refresh() : null
  }), [disconnectLocal, refresh, runBusy])

  const connect = useCallback(async () => {
    await runBusy(async (isCurrent) => {
      const current = runtimeRef.current
      const session = current?.session
      const connectAccountId = accountId.current
      if (!connectAccountId || !session || session.state !== 'active' || current?.status === 'cleanup_required' || roomRef.current) return
      const stillOwnsSession = () =>
        isCurrent() &&
        mounted.current &&
        accountId.current === connectAccountId &&
        runtimeRef.current?.session?.id === session.id
      setConnection('connecting')
      try {
        const token = await voiceFetch<{
          url: string
          token: string
          identity: string
          generation: number
          mode: string
        }>(`/api/voice/sessions/${session.id}/token`, {})
        if (!stillOwnsSession()) {
          if (isCurrent() && !roomRef.current) setConnection('idle')
          return
        }
        const { Room, RoomEvent, Track } = await import('livekit-client')
        if (!stillOwnsSession()) {
          if (isCurrent() && !roomRef.current) setConnection('idle')
          return
        }
        const active = new Room({ adaptiveStream: false, dynacast: true })
        roomRef.current = active
        roomSessionId.current = session.id
        active.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (roomRef.current !== active || track.kind !== Track.Kind.Audio) return
          audioRoot.current?.appendChild(track.attach())
        })
        active.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) =>
          track.detach().forEach((element) => element.remove()),
        )
        active.on(RoomEvent.ActiveSpeakersChanged, (participants) => {
          if (roomRef.current === active) setSpeakers(participants.map((participant) => participant.identity))
        })
        active.on(RoomEvent.Reconnecting, () => {
          if (roomRef.current === active) setConnection('reconnecting')
        })
        active.on(RoomEvent.Reconnected, () => {
          if (roomRef.current === active) setConnection('connected')
        })
        active.on(RoomEvent.Disconnected, () => {
          if (roomRef.current !== active) return
          roomRef.current = null
          roomSessionId.current = null
          stopInputMeter()
          setConnection('idle')
          setMic(false)
          setSpeakers([])
          audioRoot.current?.replaceChildren()
          void refreshRef.current()
        })
        try {
          await active.connect(token.url, token.token)
          if (roomRef.current !== active || !stillOwnsSession()) {
            if (roomRef.current === active) {
              roomRef.current = null
              roomSessionId.current = null
            }
            await active.disconnect().catch(() => undefined)
            if (isCurrent() && !roomRef.current) setConnection('idle')
            return
          }
          await active.startAudio()
          if (!stillOwnsSession()) {
            if (roomRef.current === active) {
              roomRef.current = null
              roomSessionId.current = null
            }
            await active.disconnect().catch(() => undefined)
            if (isCurrent() && !roomRef.current) setConnection('idle')
            return
          }
          if (roomRef.current === active) setConnection('connected')
          await refresh()
        } catch (caught) {
          if (roomRef.current === active) {
            roomRef.current = null
            roomSessionId.current = null
            await active.disconnect().catch(() => undefined)
            setConnection('idle')
          }
          throw caught
        }
      } catch (caught) {
        if (isCurrent() && !roomRef.current) setConnection('idle')
        throw new Error(getVoiceConnectErrorMessage(caught, Object.values(VOICE_ERROR_COPY)))
      }
    })
  }, [refresh, runBusy, stopInputMeter])

  const toggleMic = useCallback(async () => {
    await runBusy(async () => {
      const active = roomRef.current
      const current = runtimeRef.current
      if (!active || !current?.session) return
      if (current.session.mode !== 'speak') {
        await disconnectLocal()
        await voiceFetch(
          `/api/voice/sessions/${current.session.id}`,
          voiceCommand('mode', current.session.revision, { mode: 'speak' }),
        )
        await refresh()
        setError('말하기 권한으로 바꿨어요. 음성을 다시 연결한 뒤 마이크를 켜 주세요.')
        return
      }
      const enabling = !mic
      await active.localParticipant.setMicrophoneEnabled(enabling)
      if (roomRef.current !== active) return
      setMic(enabling)
      if (!enabling) {
        stopInputMeter()
        return
      }
      const sample = () => {
        if (roomRef.current !== active) {
          meterFrame.current = null
          return
        }
        setInputLevel(Math.max(0, Math.min(1, active.localParticipant.audioLevel ?? 0)))
        meterFrame.current = requestAnimationFrame(sample)
      }
      sample()
    })
  }, [disconnectLocal, mic, refresh, runBusy, stopInputMeter])

  const openVoiceSession = useCallback(async () => {
    const latest = await refresh()
    if (latest?.status === 'waiting' && latest.queue) {
      const query = latest.queue.kind === 'advice'
        ? `topic=worries&role=${latest.queue.role}&adviceTopic=${latest.queue.adviceTopic}`
        : `topic=${latest.queue.topic}`
      router.push(`/community/voice/random?${query}`)
    } else if (latest?.session?.id && (latest.status === 'offered' || latest.status === 'connected'))
      router.push(`/community/voice/session/${latest.session.id}`)
  }, [refresh, router])

  useEffect(() => {
    mounted.current = true
    let active = true
    let authRevision = 0

    const finishWithoutAuth = () => {
      accountId.current = null
      publishRuntime(null)
      setError('')
      setPhase('inactive')
    }
    if (!isSupabaseConfigured()) {
      finishWithoutAuth()
      return () => {
        active = false
        mounted.current = false
        void disconnectLocal()
      }
    }

    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      finishWithoutAuth()
      return () => {
        active = false
        mounted.current = false
        void disconnectLocal()
      }
    }

    const initialAuthRevision = authRevision
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || authRevision !== initialAuthRevision) return
      accountId.current = data.user?.id ?? null
      if (data.user) void refreshRef.current()
      else setPhase('inactive')
    }).catch(() => {
      if (!active || authRevision !== initialAuthRevision) return
      finishWithoutAuth()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      authRevision += 1
      const nextId = session?.user.id ?? null
      const changed = accountId.current !== nextId
      accountId.current = nextId
      if (changed || event === 'SIGNED_OUT' || !nextId) {
        signingOut.current = false
        signOutTask.current = null
        requestSequence.current += 1
        operationSequence.current += 1
        busyRef.current = false
        setBusy(false)
        refreshController.current?.abort()
        void disconnectLocal()
        publishRuntime(null)
        setError('')
        setPhase(nextId ? 'loading' : 'inactive')
      }
      if (nextId) queueMicrotask(() => void refreshRef.current())
    })
    const timer = window.setInterval(() => {
      if (accountId.current && document.visibilityState === 'visible' && !busyRef.current)
        void refreshRef.current()
    }, 4000)
    const onFocus = () => {
      if (accountId.current && !busyRef.current) void refreshRef.current()
    }
    const beforeSignOut = (event: Event) => {
      const detail = (event as CustomEvent<VoiceBeforeSignOutDetail>).detail
      if (signOutTask.current) { detail?.complete(signOutTask.current); return }
      const owner = accountId.current
      signingOut.current = true
      operationSequence.current += 1
      const cleanupSequence = operationSequence.current
      requestSequence.current += 1
      refreshController.current?.abort()
      busyRef.current = true
      setBusy(true)
      const cleanup: Promise<void> = cleanVoiceBeforeSignOut({
        pending: pendingOperation.current,
        isCurrent: () => mounted.current && Boolean(owner) && accountId.current === owner && operationSequence.current === cleanupSequence,
        disconnect: disconnectLocal,
        read: async () => parseVoiceGlobalRuntime(await voiceFetch('/api/voice/runtime')),
        cancel: revision => voiceFetch('/api/voice/runtime', {
          action: 'cancel_waiting', expectedRevision: revision, idempotencyKey: crypto.randomUUID(),
        }),
        leave: (id, revision) => voiceFetch(`/api/voice/sessions/${id}`, voiceCommand('leave', revision)),
      }).finally(() => {
        if (signOutTask.current === cleanup) signOutTask.current = null
        if (mounted.current && accountId.current === owner && operationSequence.current === cleanupSequence) {
          signingOut.current = false
          busyRef.current = false
          setBusy(false)
        }
      })
      signOutTask.current = cleanup
      detail?.complete(cleanup)
    }
    const onPageHide = () => {
      const current = runtimeRef.current
      void disconnectLocal()
      if (!current?.session || current.session.state === 'ended') return
      void fetch(`/api/voice/sessions/${current.session.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voiceCommand('leave', current.session.revision)),
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => undefined)
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener(VOICE_BEFORE_SIGN_OUT_EVENT, beforeSignOut)
    return () => {
      active = false
      mounted.current = false
      subscription.unsubscribe()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener(VOICE_BEFORE_SIGN_OUT_EVENT, beforeSignOut)
      requestSequence.current += 1
      operationSequence.current += 1
      refreshController.current?.abort()
      void disconnectLocal()
    }
  }, [disconnectLocal, publishRuntime])

  const value = useMemo<VoiceGlobalContextValue>(() => ({
    runtime, phase, error, busy, connection, mic, inputLevel, speakers,
    refresh, cancelWaiting, sessionCommand, connect, toggleMic, disconnectLocal, openVoiceSession,
  }), [runtime, phase, error, busy, connection, mic, inputLevel, speakers, refresh, cancelWaiting, sessionCommand, connect, toggleMic, disconnectLocal, openVoiceSession])

  return (
    <VoiceGlobalContext.Provider value={value}>
      {children}
      <div ref={audioRoot} aria-hidden="true" className={s.audioRoot} />
      <VoiceGlobalDock />
    </VoiceGlobalContext.Provider>
  )
}

export function VoiceGlobalDock() {
  const { runtime, phase, error, busy, connection, mic, cancelWaiting, sessionCommand, toggleMic, openVoiceSession, refresh } = useVoiceGlobal()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<VoiceDockPoint>(initialDockPosition)
  const drag = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    const fit = (preferDefault = false) => setPosition((current) => constrainVoiceDockPosition(
      preferDefault
        ? { x: window.innerWidth - DOCK_SIZE - 16, y: window.innerHeight - DOCK_SIZE - BOTTOM_INSET - 16 }
        : current,
      viewport(),
      DOCK_SIZE,
      BOTTOM_INSET,
    ))
    const onResize = () => fit()
    fit(true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!runtime || runtime.status === 'idle') setOpen(false)
  }, [runtime])

  if (!runtime || runtime.status === 'idle') return null
  const cleanupRequired = runtime.status === 'cleanup_required'
  const status = phase === 'error' || cleanupRequired ? 'error' : runtime.status
  const isProposedOffer = runtime.status === 'offered' && runtime.session?.state === 'proposed'
  const counts = runtime.status === 'waiting' ? runtime.queue?.waiting
    : runtime.status === 'connected' ? runtime.room?.connected : runtime.room?.waiting
  const label = cleanupRequired ? '음성 연결 시간 만료' : status === 'waiting' ? '보이스 대기 중'
    : status === 'offered' ? isProposedOffer ? '대화 요청 도착' : '음성 연결 준비됨'
      : status === 'connected'
        ? connection === 'connected' ? '보이스 참여 중' : '보이스 참여 상태 유지 중'
        : '보이스 상태 확인 필요'
  const routeLabel = runtime.status === 'waiting'
    ? '대기 화면으로 돌아가기'
    : isProposedOffer ? '대화 요청 확인하기' : '통화 화면으로 돌아가기'
  const endActionLabel = cleanupRequired ? '만료된 연결 정리하기' : isProposedOffer ? '요청 거절' : '통화 나가기'
  const countLabel = runtime.status === 'connected' ? '현재 연결' : '현재 대기'

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    suppressClick.current = false
    drag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    const next = constrainVoiceDockPosition({ x: event.clientX - drag.current.offsetX, y: event.clientY - drag.current.offsetY }, viewport(), DOCK_SIZE, BOTTOM_INSET)
    if (
      Math.abs(event.clientX - drag.current.startX) > 3 ||
      Math.abs(event.clientY - drag.current.startY) > 3
    ) drag.current.moved = true
    setPosition(next)
  }
  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const moved = drag.current?.moved ?? false
    drag.current = null
    suppressClick.current = moved
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function onPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    drag.current = null
    suppressClick.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <>
    <button
      type="button"
      className={`${s.dock} ${s[status]}`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      aria-label={`${label}. Enter로 메뉴 열기, 방향키로 위치 이동`}
      aria-expanded={open}
      aria-controls="voice-global-panel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        setOpen((current) => !current)
      }}
      onKeyDown={(event) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          setPosition((current) => moveVoiceDockByKeyboard(current, event.key, viewport(), DOCK_SIZE, BOTTOM_INSET))
        }
      }}
    >
      {status === 'error' ? <RotateCw size={23} />
        : connection === 'reconnecting' || phase === 'loading' ? <LoaderCircle className={s.spin} size={24} />
          : mic ? <Mic size={24} /> : <Headphones size={24} />}
      <span className={s.dot} aria-hidden="true" />
    </button>
    <span className={s.live} role="status" aria-live="polite">{label}</span>
    {open && <section id="voice-global-panel" className={s.panel} role="dialog" aria-label="보이스 상태">
      <button type="button" className={s.close} aria-label="보이스 상태 닫기" onClick={() => setOpen(false)}><X size={18} /></button>
      <p className={s.eyebrow}>{label}</p>
      <h2>{cleanupRequired
        ? '연결 가능한 시간이 지났어요. 이전 참여를 정리한 뒤 새로 참가해 주세요.'
        : runtime.status === 'waiting'
        ? runtime.queue?.kind === 'advice' && runtime.queue.role === 'listener' ? '이야기를 들어줄 사람으로 기다려요.' : '대화 상대를 기다리고 있어요.'
        : runtime.status === 'connected'
          ? connection === 'connected'
            ? '다른 화면에서도 이 기기의 음성이 이어지고 있어요.'
            : connection === 'connecting' || connection === 'reconnecting'
              ? '서버 참여 상태는 유지 중이며 이 기기의 음성을 다시 연결하고 있어요.'
              : '서버 참여 상태는 유지 중이지만 이 기기의 음성은 연결되지 않았어요.'
          : isProposedOffer
            ? '서로 수락한 뒤 목소리가 연결돼요.'
            : '서로 수락했어요. 통화 화면에서 이 기기의 음성을 연결해 주세요.'}</h2>
      {!cleanupRequired && counts && <p className={s.counts}>{countLabel} · 남성 {counts.genderBreakdown.malePeople} · 여성 {counts.genderBreakdown.femalePeople} · 기타·미응답 {counts.genderBreakdown.otherOrUnspecifiedPeople} · 전체 {counts.totalPeople}</p>}
      {runtime.status === 'waiting' && runtime.queue && <p className={s.meta}>대기 종료 {new Date(runtime.queue.waitUntil).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} · 자동 연장되지 않아요.</p>}
      {error && <p className={s.errorText} role="alert">{error}</p>}
      <div className={s.actions}>
        {!cleanupRequired && <button type="button" className={s.primary} disabled={busy} onClick={() => void openVoiceSession()}>{routeLabel}</button>}
        {runtime.status === 'connected' && <button type="button" className={s.secondary} disabled={busy || connection !== 'connected'} onClick={() => void toggleMic()}>{mic ? <MicOff size={17} /> : <Mic size={17} />}{mic ? '마이크 끄기' : '마이크 켜기'}</button>}
        {runtime.status === 'waiting'
          ? <button type="button" className={s.danger} disabled={busy} onClick={() => void cancelWaiting()}>대기 취소</button>
          : <button type="button" className={s.danger} disabled={busy} onClick={() => void sessionCommand('leave')}><PhoneOff size={17} />{endActionLabel}</button>}
        {phase === 'error' && <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}><RotateCw size={17} />다시 확인</button>}
      </div>
      <small>{cleanupRequired ? '정리가 확인되면 도크가 사라져요. 실패하면 다시 시도할 수 있어요.' : '마이크는 통화 화면이나 이 패널에서 직접 누를 때만 켜져요.'}</small>
    </section>}
  </>
}

type FixtureState = 'waiting' | 'offered' | 'connected' | 'error' | 'cleanup_required'

function fixtureSummary(basis: 'waiting_for_voice' | 'connected_to_voice') {
  return {
    scopeId: 'fixture:voice-global',
    asOf: '2026-09-09T00:00:00.000Z',
    basis,
    disclosureBasis: 'all_valid_participants' as const,
    policyVersion: '2026-09-07-mandatory-aggregate-v1',
    totalPeople: 3,
    genderBreakdown: { malePeople: 1, femalePeople: 1, otherOrUnspecifiedPeople: 1 },
  }
}

function fixtureRuntime(state: FixtureState): VoiceGlobalRuntime {
  if (state === 'cleanup_required') return {
    status: 'cleanup_required', revision: 2, queue: null, session: null, room: null, sessionConnected: false,
    cleanup: { sessionId: '123e4567-e89b-42d3-a456-426614174000', revision: 2 },
  }
  if (state === 'waiting' || state === 'error') return {
    status: 'waiting', revision: 1, session: null, room: null, sessionConnected: false,
    queue: {
      kind: 'advice', role: 'listener', adviceTopic: 'romance', topic: 'worries',
      waitUntil: '2099-09-09T01:05:00.000Z',
      waiting: { ...fixtureSummary('waiting_for_voice'), talkers: 2, listeners: 1 },
    },
  }
  const connected = state === 'connected'
  return {
    status: connected ? 'connected' : 'offered',
    revision: 2,
    queue: null,
    sessionConnected: connected,
    session: {
      id: '123e4567-e89b-42d3-a456-426614174000',
      roomId: '123e4567-e89b-42d3-a456-426614174001',
      kind: 'random', state: connected ? 'active' : 'proposed', revision: 2, generation: 1, mode: 'speak',
      adviceRole: 'listener', adviceTopic: 'romance', accepted: connected, peerAccepted: connected,
      participants: [
        { identity: '123e4567-e89b-42d3-a456-426614174010', displayName: '달빛', mode: 'speak', isModerator: false },
        { identity: '123e4567-e89b-42d3-a456-426614174011', displayName: '구름', mode: 'speak', isModerator: false },
      ],
    },
    room: {
      id: '123e4567-e89b-42d3-a456-426614174001',
      title: '둘이 나누는 연애 고민', description: '서로 수락한 뒤 목소리로 만나요.', topic: 'worries',
      capacity: 2, startsAt: '2026-09-09T00:00:00.000Z', endsAt: '2099-09-09T02:00:00.000Z',
      scope: 'school', departmentKey: null, sourceUrl: null, sourceRevision: null, sourceEventKey: null,
      status: 'open', revision: 0,
      connected: connected ? { ...fixtureSummary('connected_to_voice'), totalPeople: 2, genderBreakdown: { malePeople: 1, femalePeople: 1, otherOrUnspecifiedPeople: 0 } } : { ...fixtureSummary('connected_to_voice'), totalPeople: 0, genderBreakdown: { malePeople: 0, femalePeople: 0, otherOrUnspecifiedPeople: 0 } },
      waiting: connected ? { ...fixtureSummary('waiting_for_voice'), totalPeople: 0, genderBreakdown: { malePeople: 0, femalePeople: 0, otherOrUnspecifiedPeople: 0 } } : { ...fixtureSummary('waiting_for_voice'), totalPeople: 2, genderBreakdown: { malePeople: 1, femalePeople: 1, otherOrUnspecifiedPeople: 0 } },
    },
  }
}

/** Local visual review only. It never calls auth, database, notification, or media APIs. */
export function VoiceGlobalDockFixture({ initialState = 'waiting' }: { initialState?: FixtureState }) {
  const [fixtureState, setFixtureState] = useState<FixtureState>(initialState)
  const [runtime, setRuntime] = useState<VoiceGlobalRuntime | null>(() => fixtureRuntime(initialState))
  useEffect(() => setRuntime(fixtureRuntime(fixtureState)), [fixtureState])
  const phase: RuntimePhase = fixtureState === 'error' ? 'error' : 'ready'
  const value = useMemo<VoiceGlobalContextValue>(() => ({
    runtime,
    phase,
    error: fixtureState === 'error' ? '검수용 연결 오류 상태예요.' : '',
    busy: false,
    connection: fixtureState === 'connected' ? 'connected' : 'idle',
    mic: false,
    inputLevel: 0,
    speakers: [],
    refresh: async () => runtime,
    cancelWaiting: async () => setRuntime(null),
    sessionCommand: async () => { setRuntime(null); return null },
    connect: async () => undefined,
    toggleMic: async () => undefined,
    disconnectLocal: async () => undefined,
    openVoiceSession: async () => undefined,
  }), [fixtureState, phase, runtime])
  return <div className={s.fixture}>
    <aside role="status">보이스 UI 검수 · 예시 인원 · 실제 통화 아님</aside>
    <h1>전역 보이스 도크 검수</h1>
    <p>상태 버튼을 바꾼 뒤 원형 도크를 드래그하거나, 포커스 후 방향키·Home·End로 이동해 보세요.</p>
    <div className={s.fixtureControls}>
      {(['waiting', 'offered', 'connected', 'error', 'cleanup_required'] as const).map((state) => <button key={state} type="button" aria-pressed={fixtureState === state} onClick={() => setFixtureState(state)}>{state}</button>)}
    </div>
    {fixtureState === 'connected' && <strong className={s.fixtureWarning}>연결 상태 데모 · 실제 음성 연결 아님</strong>}
    {!runtime && <button type="button" className={s.fixtureReset} onClick={() => setRuntime(fixtureRuntime(fixtureState))}>취소 후 도크 다시 보기</button>}
    <VoiceGlobalContext.Provider value={value}><VoiceGlobalDock /></VoiceGlobalContext.Provider>
  </div>
}
