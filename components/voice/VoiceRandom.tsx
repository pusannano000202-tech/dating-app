'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ShieldCheck, LockKeyhole, Headphones, RefreshCw } from 'lucide-react'
import type { AdviceRole } from '@/lib/voice/contracts'
import { voiceFetch } from '@/lib/voice/client'
import { createVoiceEntryLoader, parseVoiceQueueIdentity, INITIAL_VOICE_ENTRY_STATE, type VoiceEntryLoadState } from '@/lib/voice/entry-status'
import VoiceEntryScenes, { ENTRY_TOPICS, type EntryTopic } from './VoiceEntryScenes'
import VoiceParticipation from './VoiceParticipation'
import { useVoiceGlobal } from './VoiceGlobalProvider'
import s from './voice-entry.module.css'

export default function VoiceRandom({ initialTopic = 'worries', initialRole, initialAdviceTopic }: {
  initialTopic?: string; initialRole?: string; initialAdviceTopic?: string
}) {
  const router = useRouter()
  const { runtime, phase: globalPhase, connection, refresh: refreshGlobal, cancelWaiting, openVoiceSession, sessionCommand, busy: runtimeBusy } = useVoiceGlobal()
  const [selected, setSelected] = useState<EntryTopic>(initialTopic === 'social' ? 'social' : initialAdviceTopic === 'romance' || initialAdviceTopic === 'career' ? initialAdviceTopic : 'general')
  const [role, setRole] = useState<AdviceRole | null>(initialRole === 'talker' || initialRole === 'listener' ? initialRole : null)
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState(false)
  const [rulesConfirmed, setRulesConfirmed] = useState(false)
  const [commandError, setCommandError] = useState('')
  const [scopedLoad, setScopedLoad] = useState<{ key: EntryTopic; state: VoiceEntryLoadState }>({ key: selected, state: INITIAL_VOICE_ENTRY_STATE })
  const loaderRef = useRef<ReturnType<typeof createVoiceEntryLoader> | null>(null)
  const search = useRef('')
  const busyRef = useRef(false)
  const rulesPanel = useRef<HTMLDetailsElement>(null)
  const actionsPanel = useRef<HTMLDivElement>(null)
  const [actionsHeight, setActionsHeight] = useState(190)
  const casual = selected === 'social'
  const adviceTopic = casual ? null : selected
  const chosen = ENTRY_TOPICS.find(item => item.id === selected)!
  const queued = runtime?.status === 'waiting'
  const cleanupRequired = runtime?.status === 'cleanup_required'
  const hasVoiceOwnership = Boolean(runtime && runtime.status !== 'idle')
  const globalQueue = runtime?.status === 'waiting' ? runtime.queue : null
  const runtimeTopicMatches = globalQueue?.kind === 'advice'
    ? globalQueue.adviceTopic === selected
    : globalQueue?.topic === selected
  const globalLoad: VoiceEntryLoadState | null = globalQueue && runtimeTopicMatches ? {
    phase: 'ready', refreshing: globalPhase === 'loading', error: '',
    data: {
      queued: true,
      sessionId: null,
      role: globalQueue.role,
      adviceTopic: globalQueue.adviceTopic,
      waiting: globalQueue.waiting,
      talkers: globalQueue.kind === 'advice' ? globalQueue.waiting.talkers ?? null : null,
      listeners: globalQueue.kind === 'advice' ? globalQueue.waiting.listeners ?? null : null,
    },
  } : null
  const load = globalLoad ?? (scopedLoad.key === selected ? scopedLoad.state : INITIAL_VOICE_ENTRY_STATE)

  useEffect(() => {
    const panel = actionsPanel.current
    if (!panel || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setActionsHeight(panel.getBoundingClientRect().height))
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    search.current = sessionStorage.getItem('quantum-voice-search') || crypto.randomUUID()
    sessionStorage.setItem('quantum-voice-search', search.current)
  }, [])

  useEffect(() => {
    const loader = createVoiceEntryLoader(
      signal => voiceFetch(selected === 'social' ? '/api/voice/queue' : '/api/voice/advice/queue?adviceTopic=' + selected, undefined, signal),
      selected !== 'social',
      state => {
        setScopedLoad({ key: selected, state })
        if (state.phase !== 'ready' || !state.data || busyRef.current) return
        const data = state.data
        if (data.queued && data.role) setRole(data.role)
        if (data.queued && data.adviceTopic && data.adviceTopic !== selected) setSelected(data.adviceTopic)
      },
      selected,
    )
    loaderRef.current = loader
    void loader.refresh()
    return () => { loader.dispose(); if (loaderRef.current === loader) loaderRef.current = null }
  }, [selected])

  useEffect(() => {
    if (!globalQueue) return
    if (globalQueue.kind === 'advice') {
      if (globalQueue.adviceTopic) setSelected(globalQueue.adviceTopic)
      if (globalQueue.role) setRole(globalQueue.role)
    } else if (globalQueue.topic === 'social') setSelected('social')
  }, [globalQueue])

  function chooseTopic(next: EntryTopic) {
    if (hasVoiceOwnership || busyRef.current || selected === next) return
    loaderRef.current?.dispose()
    setSelected(next)
    setPrepared(false)
    setRulesConfirmed(false)
    setCommandError('')
  }

  function prepare() {
    setPrepared(true)
    requestAnimationFrame(() => {
      rulesPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
      rulesPanel.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    })
  }

  async function command(action: 'join' | 'leave' | 'resume') {
    if (busyRef.current) return
    if (action === 'join' && (!rulesConfirmed || (!casual && !role) || load.phase !== 'ready')) {
      setCommandError('역할과 대화 약속, 현재 대기 현황을 먼저 확인해 주세요.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setCommandError('')
    try {
      if (action === 'leave') {
        await cancelWaiting()
        setPrepared(false)
        setRulesConfirmed(false)
        await loaderRef.current?.refresh()
        return
      }
      if (action === 'join') await voiceFetch('/api/voice/rules', {})
      let acknowledgement: unknown
      if (!casual) {
        acknowledgement = await voiceFetch('/api/voice/advice/queue', action === 'resume'
          ? { action, idempotencyKey: crypto.randomUUID() }
          : { action, ...(action === 'join' ? { role, adviceTopic } : {}), searchId: search.current, idempotencyKey: crypto.randomUUID() })
      } else {
        acknowledgement = await voiceFetch('/api/voice/queue', { action, topic: 'social', searchId: search.current, idempotencyKey: crypto.randomUUID() })
      }
      const confirmed = parseVoiceQueueIdentity(acknowledgement)
      await refreshGlobal()
      if (confirmed.sessionId) router.push('/community/voice/session/' + confirmed.sessionId)
    } catch (caught) {
      setCommandError(caught instanceof Error ? caught.message : '처리하지 못했어요.')
    } finally {
      busyRef.current = false
      setBusy(false)
      // A new refresh invalidates any pre-command response, including fetchers ignoring abort.
      void loaderRef.current?.refresh()
    }
  }

  return <main className={s.page}>
    <header className={s.header}>
      <Link href="/community/voice" aria-label="보이스 목록으로"><ArrowLeft size={21} /></Link>
      <span>익명 보이스</span><span />
    </header>
    <div className={s.entry} style={{ paddingBottom: Math.max(135, actionsHeight + 45) }}>
      <h1>{runtime?.status === 'offered' ? <>대화 요청이<br /><em>도착했어요.</em></> : runtime?.status === 'connected' ? <>목소리로<br /><em>함께하고 있어요.</em></> : queued ? <>같은 이야기를 고른<br /><em>한 사람을 기다려요.</em></> : casual ? <>오늘 하루,<br /><em>가볍게 나눠볼까요?</em></> : <>오늘은 말할까요,<br /><em>들어볼까요?</em></>}</h1>
      <p className={s.subtitle}>같은 학교의 한 사람과, 목소리로 가까워지는 시간.</p>
      <VoiceParticipation state={load} label={chosen.label} casual={casual} onRefresh={() => { if (!busyRef.current) void loaderRef.current?.refresh() }} />
      {hasVoiceOwnership ? <section className={s.waiting} aria-label={queued ? '대화 상대 대기 중' : '진행 중인 보이스'}>
        <Headphones size={32} />
        <h2>{cleanupRequired ? '연결 시간이 만료됐어요. 이전 참여를 정리하고 다시 시작해 주세요.' : queued
          ? `${chosen.label} 이야기를 함께할 사람을 찾고 있어요.`
          : runtime?.status === 'connected'
            ? connection === 'connected'
              ? '다른 화면에서도 이 기기의 음성이 이어지고 있어요.'
              : '참여 상태는 유지 중이지만 이 기기의 음성은 연결되지 않았어요.'
            : '서로 수락할 대화 요청을 확인해 주세요.'}</h2>
        <p>{queued && !casual && (role === 'talker' ? '내 이야기를 말하는 역할로 기다리고 있어요. ' : '이야기를 들어주는 역할로 기다리고 있어요. ')}{runtime?.status === 'offered' ? '수락 전에는 음성이 전달되지 않아요.' : queued ? '서로 수락한 뒤 연결돼요.' : '마이크는 직접 켤 때만 시작돼요.'}</p>
        {queued && globalQueue ? <small>대기는 {new Date(globalQueue.waitUntil).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}에 끝나며 자동 연장되지 않아요.</small> : null}
      </section> : <>
        <VoiceEntryScenes selected={selected} role={role} disabled={busy} onRole={setRole} onTopic={chooseTopic} />
        <p className={s.prompt}>첫마디가 어렵다면<strong>“{chosen.prompt}”</strong></p>
      </>}
      {!hasVoiceOwnership && <details ref={rulesPanel} className={s.rules} open={prepared} onToggle={event => setPrepared(event.currentTarget.open)}>
        <summary><ShieldCheck size={18} /><span>가볍게 시작해도, 서로에게는 다정하게</span><span className={s.more}>확인</span></summary>
        <div className={s.rulesBody}>
          <p>고민 나눔은 전문 상담이 아닌 또래 간 대화예요. 비난·성희롱·개인정보 요구 없이 대화해요.</p>
          <p>이름과 전화번호는 공개하지 않고 친구로 자동 추가되지 않아요. 마이크는 연결 화면에서 직접 켜요.</p>
          <label><input type="checkbox" checked={rulesConfirmed} disabled={busy} onChange={event => setRulesConfirmed(event.target.checked)} />대화 약속을 확인했고 지키겠습니다.</label>
        </div>
      </details>}
      {commandError && <p className={s.commandError} role="alert">{commandError}</p>}
      <div ref={actionsPanel} className={s.actions}>
        {!hasVoiceOwnership ? <div id="voice-start-status" className={s.startStatus} role="status">
          {load.phase !== 'ready' ? <div><p>{load.phase === 'loading' || load.refreshing ? '참여 가능한 상태인지 확인하고 있어요.' : load.error || '연결 상태를 확인하지 못해 상대 찾기를 시작할 수 없어요.'}</p><p>주제·역할·동의 선택은 유지돼요. 아직 대기 등록되지 않았어요.</p>{load.phase === 'error' ? <button type="button" className={s.secondary} disabled={busy || load.refreshing} onClick={() => { if (!busyRef.current) void loaderRef.current?.refresh() }}><RefreshCw size={16} />{load.refreshing ? '확인 중…' : '다시 확인'}</button> : null}</div> : !casual && !role ? '오늘의 역할을 먼저 골라 주세요.' : !rulesConfirmed ? '대화 약속에 동의하면 상대 찾기를 시작할 수 있어요.' : '선택과 동의를 확인했어요. 상대 찾기를 눌러야 대기가 시작돼요.'}
        </div> : null}
        {hasVoiceOwnership ? <>
          {cleanupRequired && <button className={s.primary} disabled={busy || runtimeBusy} onClick={() => void sessionCommand('leave')}>만료된 연결 정리하기</button>}
          {!queued && !cleanupRequired && <button className={s.primary} disabled={busy} onClick={() => void openVoiceSession()}>{busy ? '상태 확인 중…' : '대화로 돌아가기'}<ArrowRight size={18} /></button>}
          {queued && !casual && <button className={s.primary} disabled={busy} onClick={() => void command('resume')}>{busy ? '상태 확인 중…' : '연결 정리 확인하고 계속 찾기'}<ArrowRight size={18} /></button>}
          {queued && <button className={s.secondary} disabled={busy} onClick={() => void command('leave')}>대기 그만하기</button>}
        </> : !prepared ? <button className={s.primary} aria-describedby="voice-start-status" disabled={busy || (!casual && !role)} onClick={prepare}>{!casual && !role ? '오늘의 역할을 먼저 골라 주세요' : chosen.label + ' 대화 준비하기'}<ArrowRight size={18} /></button> : <button className={s.primary} aria-describedby="voice-start-status" disabled={busy || !rulesConfirmed || (!casual && !role) || load.phase !== 'ready'} onClick={() => void command('join')}>{busy ? '처리 중…' : '대화 상대 찾기'}<ArrowRight size={18} /></button>}
      </div>
      <p className={s.reassurance}><LockKeyhole size={13} />익명으로 시작해요. 서로 수락하기 전에는 연결되지 않아요.</p>
    </div>
  </main>
}
