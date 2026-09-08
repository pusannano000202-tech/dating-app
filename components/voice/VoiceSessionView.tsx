'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  SkipForward,
  Flag,
  ShieldCheck,
} from 'lucide-react'
import type { Room, RemoteTrack } from 'livekit-client'
import type {
  VoiceSession,
  VoiceRoom,
  VoiceCommand,
} from '@/lib/voice/contracts'
import { VOICE_ERROR_COPY, voiceFetch, voiceCommand } from '@/lib/voice/client'
import {
  canFinalizeVoiceDisconnect,
  getVoiceConnectErrorMessage,
  isCurrentVoiceRefresh,
  isCurrentVoiceRoom,
  isCurrentVoiceSessionEpoch,
  releaseCurrentVoiceRoom,
} from '@/lib/voice/media-lifecycle'
import s from './voice.module.css'
export default function VoiceSessionView({ sessionId }: { sessionId: string }) {
  const router = useRouter(),
    [session, setSession] = useState<VoiceSession | null>(null),
    [room, setRoom] = useState<VoiceRoom | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState<
      'idle' | 'connecting' | 'connected' | 'reconnecting'
    >('idle'),
    [mic, setMic] = useState(false),
    [inputLevel, setInputLevel] = useState(0),
    [speakers, setSpeakers] = useState<string[]>([]),
    [reporting, setReporting] = useState(false),
    [reason, setReason] = useState(''),
    [target, setTarget] = useState(''),
    [reportDone, setReportDone] = useState(false)
  const media = useRef<Room | null>(null),
    audioRoot = useRef<HTMLDivElement | null>(null),
    latest = useRef<VoiceSession | null>(null),
    alive = useRef(true),
    sessionEpoch = useRef(0),
    refreshSequence = useRef(0),
    meterFrame = useRef<number | null>(null)
  const stopInputMeter = useCallback(() => {
    if (meterFrame.current !== null) cancelAnimationFrame(meterFrame.current)
    meterFrame.current = null
    if (alive.current) setInputLevel(0)
  }, [])
  const disconnect = useCallback(async (disconnectEpoch = sessionEpoch.current) => {
    stopInputMeter()
    const active = media.current
    if (active) {
      releaseCurrentVoiceRoom(media, active)
      await active.disconnect().catch(() => undefined)
    }
    if (
      !canFinalizeVoiceDisconnect(
        media,
        sessionEpoch,
        disconnectEpoch,
        alive.current,
      )
    )
      return
    setMic(false)
    setConnection('idle')
    setSpeakers([])
    audioRoot.current?.replaceChildren()
  }, [stopInputMeter])
  const refresh = useCallback(async (refreshEpoch = sessionEpoch.current) => {
    const requestSequence = refreshSequence.current + 1
    refreshSequence.current = requestSequence
    try {
      const d = await voiceFetch<{ session: VoiceSession; room: VoiceRoom }>(
        '/api/voice/sessions/' + sessionId,
      )
      if (
        !isCurrentVoiceRefresh(
          sessionEpoch,
          refreshEpoch,
          refreshSequence,
          requestSequence,
          alive.current,
        )
      )
        return
      if (latest.current && latest.current.generation !== d.session.generation) {
        await disconnect(refreshEpoch)
        if (
          !isCurrentVoiceRefresh(
            sessionEpoch,
            refreshEpoch,
            refreshSequence,
            requestSequence,
            alive.current,
          )
        )
          return
      }
      latest.current = d.session
      setSession(d.session)
      setRoom(d.room)
      if (d.session.state === 'ended') await disconnect(refreshEpoch)
    } catch (e) {
      if (
        !isCurrentVoiceRefresh(
          sessionEpoch,
          refreshEpoch,
          refreshSequence,
          requestSequence,
          alive.current,
        )
      )
        return
      setError(
        e instanceof Error ? e.message : '대화 상태를 확인하지 못했어요.',
      )
      await disconnect(refreshEpoch)
    }
  }, [sessionId, disconnect])
  useEffect(() => {
    const effectEpoch = sessionEpoch.current + 1
    sessionEpoch.current = effectEpoch
    alive.current = true
    latest.current = null
    setSession(null)
    setRoom(null)
    setError('')
    setBusy(false)
    setConnection('idle')
    setMic(false)
    setInputLevel(0)
    setSpeakers([])
    setReporting(false)
    setReason('')
    setTarget('')
    setReportDone(false)
    audioRoot.current?.replaceChildren()
    void refresh(effectEpoch)
    const id = setInterval(() => void refresh(effectEpoch), 5000)
    const leaveOnPageHide = () => {
      const current = latest.current
      void disconnect(effectEpoch)
      if (!current || current.state === 'ended') return
      // Best effort only: server-side disconnected-member expiry is the durable fallback.
      void fetch('/api/voice/sessions/' + sessionId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voiceCommand('leave', current.revision)),
        keepalive: true,
      }).catch(() => undefined)
    }
    window.addEventListener('pagehide', leaveOnPageHide)
    return () => {
      alive.current = false
      clearInterval(id)
      window.removeEventListener('pagehide', leaveOnPageHide)
      void disconnect(effectEpoch)
      if (sessionEpoch.current === effectEpoch) sessionEpoch.current += 1
    }
  }, [refresh, disconnect, sessionId])
  async function command(
    action: VoiceCommand['action'],
    extra: Partial<VoiceCommand> = {},
  ) {
    const commandSession = latest.current
    if (!commandSession || busy) return
    const commandEpoch = sessionEpoch.current
    setBusy(true)
    setError('')
    try {
      if (['leave', 'next', 'mode'].includes(action))
        await disconnect(commandEpoch)
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          commandEpoch,
          alive.current,
        )
      )
        return
      if (action === 'next' && commandSession.adviceRole) {
        const result = await voiceFetch<{
          sessionId: string | null
          queued: boolean
          role: 'talker' | 'listener'
          adviceTopic: 'general' | 'romance' | 'career'
          mediaCleanupPending: boolean
        }>('/api/voice/advice/next', {
          sessionId,
          idempotencyKey: crypto.randomUUID(),
        })
        if (
          !isCurrentVoiceSessionEpoch(
            sessionEpoch,
            commandEpoch,
            alive.current,
          )
        )
          return
        router.replace(
          result.sessionId
            ? '/community/voice/session/' + result.sessionId
            :
                '/community/voice/random?topic=worries&role=' +
                result.role +
                '&adviceTopic=' +
                result.adviceTopic,
        )
        return
      }
      await voiceFetch(
        '/api/voice/sessions/' + sessionId,
        voiceCommand(action, commandSession.revision, extra),
      )
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          commandEpoch,
          alive.current,
        )
      )
        return
      await refresh(commandEpoch)
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          commandEpoch,
          alive.current,
        )
      )
        return
      if (action === 'next')
        router.replace(
          '/community/voice/random?topic=' + (room?.topic ?? 'worries'),
        )
      else if (action === 'leave') router.replace('/community/voice')
    } catch (e) {
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          commandEpoch,
          alive.current,
        )
      )
        return
      setError(e instanceof Error ? e.message : '요청하지 못했어요.')
      await refresh(commandEpoch)
    } finally {
      if (
        isCurrentVoiceSessionEpoch(
          sessionEpoch,
          commandEpoch,
          alive.current,
        )
      )
        setBusy(false)
    }
  }
  async function connect() {
    if (busy || media.current) return
    const connectEpoch = sessionEpoch.current
    setBusy(true)
    setError('')
    setConnection('connecting')
    let active: Room | null = null
    let mayUpdateUi = true
    try {
      const token = await voiceFetch<{
        url: string
        token: string
        identity: string
        generation: number
        mode: string
      }>('/api/voice/sessions/' + sessionId + '/token', {})
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          connectEpoch,
          alive.current,
        )
      ) {
        mayUpdateUi = false
        return
      }
      const { Room, RoomEvent, Track } = await import('livekit-client')
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          connectEpoch,
          alive.current,
        )
      ) {
        mayUpdateUi = false
        return
      }
      active = new Room({ adaptiveStream: false, dynacast: true })
      media.current = active
      active.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (
          !isCurrentVoiceSessionEpoch(
            sessionEpoch,
            connectEpoch,
            alive.current,
          ) ||
          !isCurrentVoiceRoom(media, active, alive.current)
        )
          return
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach()
          audioRoot.current?.appendChild(element)
        }
      })
      active.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) =>
        track.detach().forEach((e) => e.remove()),
      )
      active.on(RoomEvent.ActiveSpeakersChanged, (p) => {
        if (
          !isCurrentVoiceSessionEpoch(
            sessionEpoch,
            connectEpoch,
            alive.current,
          ) ||
          !isCurrentVoiceRoom(media, active, alive.current)
        )
          return
        setSpeakers(p.map((v) => v.identity))
      })
      active.on(RoomEvent.Reconnecting, () => {
        if (
          !isCurrentVoiceSessionEpoch(
            sessionEpoch,
            connectEpoch,
            alive.current,
          ) ||
          !isCurrentVoiceRoom(media, active, alive.current)
        )
          return
        setConnection('reconnecting')
      })
      active.on(RoomEvent.Reconnected, () => {
        if (
          !isCurrentVoiceSessionEpoch(
            sessionEpoch,
            connectEpoch,
            alive.current,
          ) ||
          !isCurrentVoiceRoom(media, active, alive.current)
        )
          return
        setConnection('connected')
      })
      active.on(RoomEvent.Disconnected, () => {
        if (
          !isCurrentVoiceSessionEpoch(
            sessionEpoch,
            connectEpoch,
            alive.current,
          )
        )
          return
        if (!releaseCurrentVoiceRoom(media, active)) return
        stopInputMeter()
        if (alive.current) {
          setConnection('idle')
          setMic(false)
          setSpeakers([])
        }
        audioRoot.current?.replaceChildren()
      })
      await active.connect(token.url, token.token)
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          connectEpoch,
          alive.current,
        ) ||
        !isCurrentVoiceRoom(media, active, alive.current)
      ) {
        mayUpdateUi = false
        await active.disconnect().catch(() => undefined)
        return
      }
      await active.startAudio()
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          connectEpoch,
          alive.current,
        ) ||
        !isCurrentVoiceRoom(media, active, alive.current)
      ) {
        mayUpdateUi = false
        await active.disconnect().catch(() => undefined)
        return
      }
      setConnection('connected')
    } catch (e) {
      const currentConnectEpoch = isCurrentVoiceSessionEpoch(
        sessionEpoch,
        connectEpoch,
        alive.current,
      )
      const failedCurrentRoom =
        currentConnectEpoch &&
        (active
          ? isCurrentVoiceRoom(media, active, alive.current)
          : media.current === null)
      if (active && failedCurrentRoom) releaseCurrentVoiceRoom(media, active)
      if (active) await active.disconnect().catch(() => undefined)
      if (
        !mayUpdateUi ||
        !failedCurrentRoom ||
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          connectEpoch,
          alive.current,
        ) ||
        media.current !== null
      ) {
        mayUpdateUi = false
        return
      }
      setConnection('idle')
      setError(getVoiceConnectErrorMessage(e, Object.values(VOICE_ERROR_COPY)))
    } finally {
      if (
        mayUpdateUi &&
        isCurrentVoiceSessionEpoch(
          sessionEpoch,
          connectEpoch,
          alive.current,
        )
      )
        setBusy(false)
    }
  }
  async function toggleMic() {
    const active = media.current
    if (!active || busy) return
    const toggleEpoch = sessionEpoch.current
    if (session?.mode !== 'speak') {
      await command('mode', { mode: 'speak' })
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          toggleEpoch,
          alive.current,
        )
      )
        return
      setError(
        '말하기 권한으로 바꿨어요. 음성을 다시 연결하고 마이크를 켜 주세요.',
      )
      return
    }
    setBusy(true)
    try {
      const enabling = !mic
      await active.localParticipant.setMicrophoneEnabled(enabling)
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          toggleEpoch,
          alive.current,
        ) ||
        !isCurrentVoiceRoom(media, active, alive.current)
      )
        return
      setMic(enabling)
      if (enabling) {
        const sample = () => {
          if (
            !isCurrentVoiceSessionEpoch(
              sessionEpoch,
              toggleEpoch,
              alive.current,
            ) ||
            !isCurrentVoiceRoom(media, active, alive.current)
          ) {
            meterFrame.current = null
            return
          }
          const level = active.localParticipant.audioLevel ?? 0
          setInputLevel(Math.max(0, Math.min(1, level)))
          meterFrame.current = requestAnimationFrame(sample)
        }
        sample()
      } else stopInputMeter()
    } catch {
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          toggleEpoch,
          alive.current,
        ) ||
        !isCurrentVoiceRoom(media, active, alive.current)
      )
        return
      setError(
        '마이크 접근을 허용하지 않았거나 사용할 수 없어요. 듣기는 계속할 수 있어요.',
      )
    } finally {
      if (
        isCurrentVoiceSessionEpoch(
          sessionEpoch,
          toggleEpoch,
          alive.current,
        )
      )
        setBusy(false)
    }
  }
  async function report(block: boolean) {
    if (busy || !target || reason.trim().length < 3) return
    const reportEpoch = sessionEpoch.current
    setBusy(true)
    setError('')
    try {
      if (block) await disconnect(reportEpoch)
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          reportEpoch,
          alive.current,
        )
      )
        return
      await voiceFetch('/api/voice/reports', {
        sessionId,
        targetIdentity: target,
        reason,
        block,
        idempotencyKey: crypto.randomUUID(),
      })
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          reportEpoch,
          alive.current,
        )
      )
        return
      setReportDone(true)
      if (block) router.replace('/community/voice')
    } catch (e) {
      if (
        !isCurrentVoiceSessionEpoch(
          sessionEpoch,
          reportEpoch,
          alive.current,
        )
      )
        return
      setError(e instanceof Error ? e.message : '신고하지 못했어요.')
    } finally {
      if (
        isCurrentVoiceSessionEpoch(
          sessionEpoch,
          reportEpoch,
          alive.current,
        )
      )
        setBusy(false)
    }
  }
  const ended = session?.state === 'ended'
  return (
    <main className={s.page}>
      <div className={s.session}>
        <Link
          className={s.back}
          href="/community/voice"
          onClick={(event) => {
            if (session && !ended) {
              event.preventDefault()
              void command('leave')
            } else void disconnect()
          }}
        >
          <ArrowLeft size={16} />
          보이스 라운지
        </Link>
        <section className={s.stage}>
          <p className={s.eyebrow}>
            {ended
              ? '대화가 끝났어요'
              : connection === 'connected'
                ? '음성 연결됨'
                : connection === 'reconnecting'
                  ? '연결을 복구하고 있어요'
                  : session?.state === 'proposed'
                    ? '서로 수락하면 연결돼요'
                    : '아직 마이크는 꺼져 있어요'}
          </p>
          <h1>{room?.title ?? '대화 상태 확인 중'}</h1>
          <p className={s.subtitle}>{room?.description}</p>
          {(connection === 'connecting' || connection === 'reconnecting' || session?.state === 'proposed') && (
            <div className={s.waitingPulse} aria-hidden="true"><Headphones size={30} /></div>
          )}
          <div className={s.people}>
            {session?.participants.map((p) => (
              <div
                key={p.identity}
                className={
                  s.person +
                  ' ' +
                  (speakers.includes(p.identity) ? s.speaking : '')
                }
              >
                <div className={s.avatar} aria-hidden="true">
                  {p.displayName.slice(0, 1)}
                </div>
                <strong className="block truncate">{p.displayName}</strong>
                <span className={s.small}>
                  {p.mode === 'listen' ? '듣기 참여' : '말하기 참여'}
                  {p.isModerator ? ' · 진행자' : ''}
                </span>
              </div>
            ))}
          </div>
          {session?.state === 'proposed' && (
            <p className={s.notice}>
              {session.accepted
                ? '수락했어요. 상대방의 수락을 기다려 주세요.'
                : '목소리로 이야기 나눌까요? 수락 전에는 음성이 전달되지 않아요.'}
            </p>
          )}
          <div ref={audioRoot} aria-hidden="true" />
          {connection === 'connected' && mic && (
            <div className={s.inputMeter}>
              <span>내 마이크 입력</span>
              <div role="meter" aria-label="내 마이크 입력 크기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(inputLevel * 100)}>
                <i style={{ width: `${Math.max(4, inputLevel * 100)}%` }} />
              </div>
            </div>
          )}
          <p className={s.small}>
            <ShieldCheck size={13} className="inline" /> 녹음·영상 없이, 원할 때
            나갈 수 있어요.
          </p>
        </section>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.controls}>
          {!ended && session?.state === 'proposed' && !session.accepted && (
            <button
              className={s.primary}
              disabled={busy}
              onClick={() => void command('accept')}
            >
              대화 수락하기
            </button>
          )}
          {!ended && session?.state === 'active' && connection === 'idle' && (
            <button
              className={s.primary}
              disabled={busy}
              onClick={() => void connect()}
            >
              <Headphones size={19} />
              음성 연결하기
            </button>
          )}
          {connection === 'connected' && (
            <button
              className={mic ? s.primary : s.secondary}
              disabled={busy}
              onClick={() => void toggleMic()}
            >
              {mic ? <Mic size={19} /> : <MicOff size={19} />}{' '}
              {mic ? '마이크 끄기' : '마이크 켜기'}
            </button>
          )}
          {!ended && session?.kind === 'random' && (
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => void command('next')}
            >
              <SkipForward size={18} />
              {session.adviceRole ? '같은 역할로 다음 사람' : '다음 사람'}
            </button>
          )}
          {!ended && session && (
            <button
              className={s.danger}
              disabled={busy}
              onClick={() => void command('leave')}
            >
              <PhoneOff size={18} />
              나가기
            </button>
          )}
          {ended && (
            <Link className={s.primary} href="/community/voice">
              다른 이야기 보기
            </Link>
          )}
        </div>
        <button className={s.back} onClick={() => setReporting(!reporting)}>
          <Flag size={14} />
          불편한 일이 있었나요?
        </button>
        {reporting && (
          <section className={s.card}>
            <h3>신고와 차단</h3>
            <p>
              신고 내용은 상대에게 공개하지 않아요. 차단하면 내가 이 방에서
              나가고 이후 함께 연결되지 않아요.
            </p>
            <label className={s.field}>
              대상
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">참여자 선택</option>
                {session?.participants.map((p) => (
                  <option key={p.identity} value={p.identity}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              어떤 일이 있었나요?
              <textarea
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className={s.actions}>
              <button
                className={s.secondary}
                disabled={busy || !target || reason.trim().length < 3}
                onClick={() => void report(false)}
              >
                신고 접수
              </button>
              <button
                className={s.danger}
                disabled={busy || !target || reason.trim().length < 3}
                onClick={() => void report(true)}
              >
                신고하고 차단·나가기
              </button>
            </div>
            {reportDone && (
              <p role="status">신고를 접수했어요. 운영자가 확인합니다.</p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
