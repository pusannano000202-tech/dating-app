'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Flag, Headphones, Mic, MicOff, PhoneOff, ShieldCheck, SkipForward } from 'lucide-react'
import { voiceFetch } from '@/lib/voice/client'
import type { VoiceCommand } from '@/lib/voice/contracts'
import VoiceConversationPrompts from '@/components/social/VoiceConversationPrompts'
import { useVoiceGlobal } from './VoiceGlobalProvider'
import s from './voice.module.css'

export default function VoiceSessionView({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const {
    runtime,
    phase,
    error: globalError,
    busy,
    connection,
    mic,
    inputLevel,
    speakers,
    refresh,
    sessionCommand,
    connect,
    toggleMic,
    disconnectLocal,
  } = useVoiceGlobal()
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState('')
  const [reportDone, setReportDone] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const ownsRouteSession = runtime?.session?.id === sessionId
  const session = ownsRouteSession ? runtime.session : null
  const room = ownsRouteSession ? runtime.room : null
  const ended = !session && phase === 'ready'
  const cleanupRequired = runtime?.status === 'cleanup_required' && runtime.cleanup?.sessionId === sessionId
  const error = localError || globalError

  useEffect(() => {
    setReporting(false)
    setReason('')
    setTarget('')
    setReportDone(false)
    setLocalError('')
    void refresh()
  }, [refresh, sessionId])

  async function command(action: VoiceCommand['action']) {
    setLocalError('')
    const result = await sessionCommand(action)
    if (!result) return
    if (action === 'leave') {
      router.push('/community/voice')
      return
    }
    if (action === 'next') {
      const queue = result?.queue
      if (result?.status === 'waiting' && queue?.kind === 'advice')
        router.push(`/community/voice/random?topic=worries&role=${queue.role}&adviceTopic=${queue.adviceTopic}`)
      else router.push('/community/voice/random?topic=social')
    }
  }

  async function report(block: boolean) {
    if (reportBusy || busy || !session || !target || reason.trim().length < 3) return
    setReportBusy(true)
    setLocalError('')
    try {
      if (block) await disconnectLocal()
      await voiceFetch('/api/voice/reports', {
        sessionId,
        targetIdentity: target,
        reason,
        block,
        idempotencyKey: crypto.randomUUID(),
      })
      setReportDone(true)
      await refresh()
      if (block) router.push('/community/voice')
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : '신고하지 못했어요.')
    } finally {
      setReportBusy(false)
    }
  }

  return <main className={s.page}>
    <div className={s.session}>
      <Link className={s.back} href="/community/voice"><ArrowLeft size={16} />보이스 라운지</Link>
      <section className={s.stage}>
        <p className={s.eyebrow}>
          {cleanupRequired ? '연결 시간이 만료됐어요. 이전 참여를 정리해 주세요.' : ended ? '대화가 끝났거나 만료됐어요'
            : connection === 'connected' ? '음성 연결됨'
              : connection === 'reconnecting' ? '연결을 복구하고 있어요'
                : session?.state === 'proposed' ? '서로 수락하면 연결돼요'
                  : '아직 마이크는 꺼져 있어요'}
        </p>
        <h1>{room?.title ?? (phase === 'loading' ? '대화 상태 확인 중' : '이 대화는 더 이상 열려 있지 않아요.')}</h1>
        <p className={s.subtitle}>{room?.description ?? '보이스 라운지에서 현재 상태를 다시 확인해 주세요.'}</p>
        {(connection === 'connecting' || connection === 'reconnecting' || session?.state === 'proposed') && <div className={s.waitingPulse} aria-hidden="true"><Headphones size={30} /></div>}
        <div className={s.people}>
          {session?.participants.map((participant) => <div key={participant.identity} className={`${s.person} ${speakers.includes(participant.identity) ? s.speaking : ''}`}>
            <div className={s.avatar} aria-hidden="true">{participant.displayName.slice(0, 1)}</div>
            <strong className="block truncate">{participant.displayName}</strong>
            <span className={s.small}>{participant.mode === 'listen' ? '듣기 참여' : '말하기 참여'}{participant.isModerator ? ' · 진행자' : ''}</span>
          </div>)}
        </div>
        {session?.state === 'proposed' && <p className={s.notice}>{session.accepted ? '수락했어요. 상대방의 수락을 기다려 주세요.' : '목소리로 이야기 나눌까요? 수락 전에는 음성이 전달되지 않아요.'}</p>}
        {connection === 'connected' && mic && <div className={s.inputMeter}>
          <span>내 마이크 입력</span>
          <div role="meter" aria-label="내 마이크 입력 크기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(inputLevel * 100)}><i style={{ width: `${Math.max(4, inputLevel * 100)}%` }} /></div>
        </div>}
        <p className={s.small}><ShieldCheck size={13} className="inline" /> 녹음·영상 없이, 원할 때 나갈 수 있어요. 앱 안의 다른 화면으로 이동해도 연결은 유지돼요.</p>
      </section>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.controls}>
        {cleanupRequired && <button className={s.danger} disabled={busy} onClick={() => void command('leave')}><PhoneOff size={18} />만료된 연결 정리하기</button>}
        {!ended && !cleanupRequired && session?.state === 'proposed' && !session.accepted && <button className={s.primary} disabled={busy} onClick={() => void command('accept')}>대화 수락하기</button>}
        {!ended && !cleanupRequired && session?.state === 'active' && connection === 'idle' && <button className={s.primary} disabled={busy} onClick={() => void connect()}><Headphones size={19} />음성 연결하기</button>}
        {connection === 'connected' && <button className={mic ? s.primary : s.secondary} disabled={busy} onClick={() => void toggleMic()}>{mic ? <Mic size={19} /> : <MicOff size={19} />}{mic ? '마이크 끄기' : '마이크 켜기'}</button>}
        {!ended && !cleanupRequired && session?.kind === 'random' && <button className={s.secondary} disabled={busy} onClick={() => void command('next')}><SkipForward size={18} />{session.adviceRole ? '같은 역할로 다음 사람' : '다음 사람'}</button>}
        {!ended && session && <button className={s.danger} disabled={busy} onClick={() => void command('leave')}><PhoneOff size={18} />{cleanupRequired ? '만료된 연결 정리하기' : '나가기'}</button>}
        {ended && <Link className={s.primary} href="/community/voice">다른 이야기 보기</Link>}
      </div>
      {!cleanupRequired && session?.state === 'active' && room && <VoiceConversationPrompts
        key={`${session.id}:${room.topic}:${room.scope}:${session.adviceRole ?? 'none'}`}
        topic={room.topic}
        scope={room.scope}
        adviceRole={session.adviceRole}
      />}
      {session && <>
        <button className={s.back} onClick={() => setReporting(!reporting)}><Flag size={14} />불편한 일이 있었나요?</button>
        {reporting && <section className={s.card}>
          <h3>신고와 차단</h3>
          <p>신고 내용은 상대에게 공개하지 않아요. 차단하면 내가 이 방에서 나가고 이후 함께 연결되지 않아요.</p>
          <label className={s.field}>대상<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">참여자 선택</option>{session.participants.map((participant) => <option key={participant.identity} value={participant.identity}>{participant.displayName}</option>)}</select></label>
          <label className={s.field}>어떤 일이 있었나요?<textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <div className={s.actions}>
            <button className={s.secondary} disabled={busy || reportBusy || !target || reason.trim().length < 3} onClick={() => void report(false)}>신고 접수</button>
            <button className={s.danger} disabled={busy || reportBusy || !target || reason.trim().length < 3} onClick={() => void report(true)}>신고하고 차단·나가기</button>
          </div>
          {reportDone && <p role="status">신고를 접수했어요. 운영자가 확인합니다.</p>}
        </section>}
      </>}
    </div>
  </main>
}
