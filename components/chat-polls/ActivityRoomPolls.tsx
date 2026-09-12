'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, Check, ChevronDown, Pin, Plus, RefreshCw, X } from 'lucide-react'

import {
  chatPollErrorMessage,
  isChatPollId,
  parseChatPollBoard,
  parseCreateChatPollInput,
  type ChatPoll,
  type ChatPollBoard,
  type ChatPollPurpose,
  type ChatPollSelectionMode,
} from '@/lib/chat-polls/contract'
import { ChatPollRequestCoordinator, type ChatPollScopeToken } from '@/lib/chat-polls/coordinator'
import { mergePollSelections } from '@/lib/chat-polls/selection-drafts'
import { createClient } from '@/lib/supabase'
import styles from './chat-polls.module.css'

const purposeLabels: Record<ChatPollPurpose, string> = {
  schedule: '일정', place: '장소', role: '역할', general: '자유 투표',
}
const purposePlaceholders: Record<ChatPollPurpose, [string, string]> = {
  schedule: ['금요일 오후 7시', '토요일 오후 2시'],
  place: ['정문 앞', '학생회관 앞'],
  role: ['진행 맡기', '준비물 챙기기'],
  general: ['첫 번째 선택', '두 번째 선택'],
}

type Draft = {
  purpose: ChatPollPurpose
  title: string
  selectionMode: ChatPollSelectionMode
  options: string[]
}
type StatusConfirmation = {
  pollId: string
  revision: number
  action: 'close' | 'cancel'
  title: string
}
export type ChatPollRoomKind = 'activity-rooms' | 'meetups' | 'friends' | 'department-challenges' | 'league-teams'
export type ChatPollTransport = (path: string, init?: RequestInit) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

const emptyDraft = (): Draft => ({ purpose: 'general', title: '', selectionMode: 'single', options: ['', ''] })

function payloadValue(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== 'object') return null
  return (payload as Record<string, unknown>)[key] ?? null
}

function responseError(payload: unknown): string {
  const error = payloadValue(payload, 'error')
  if (typeof error === 'string') return error
  return 'community_unavailable'
}

function selectedIds(poll: ChatPoll): string[] {
  return poll.options.filter(option => option.selectedByMe).map(option => option.id)
}

function uniqueWinner(poll: ChatPoll) {
  if (poll.ballotCount === 0) return { kind: 'empty' as const, option: null }
  const max = Math.max(...poll.options.map(option => option.voteCount))
  const winners = poll.options.filter(option => option.voteCount === max)
  if (max === 0) return { kind: 'empty' as const, option: null }
  if (winners.length !== 1) return { kind: 'tied' as const, option: null }
  return { kind: 'winner' as const, option: winners[0] }
}

export default function ActivityRoomPolls({
  roomId,
  roomKind = 'activity-rooms',
  transport,
  composerRequest = 0,
  readOnly = false,
}: {
  roomId: string
  roomKind?: ChatPollRoomKind
  transport?: ChatPollTransport
  composerRequest?: number
  readOnly?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const handledComposerRequest = useRef(0)
  const latestComposerRequest = useRef(composerRequest)
  latestComposerRequest.current = composerRequest
  const sectionRef = useRef<HTMLElement>(null)
  const composerDialog = useRef<HTMLDivElement>(null)
  const confirmationDialog = useRef<HTMLDivElement>(null)
  const [board, setBoard] = useState<ChatPollBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [statusConfirmation, setStatusConfirmation] = useState<StatusConfirmation | null>(null)
  const [authScopeRevision, setAuthScopeRevision] = useState(0)
  const [authAccount, setAuthAccount] = useState<string | null | undefined>(undefined)
  const authAccountRef = useRef<string | null | undefined>(undefined)
  const [preview, setPreview] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [draftError, setDraftError] = useState('')
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const dirtySelections = useRef(new Set<string>())
  const [agreementTarget, setAgreementTarget] = useState<string | null>(null)
  const [agreementSummary, setAgreementSummary] = useState('')
  const pendingCreate = useRef<{ fingerprint: string; key: string } | null>(null)
  const pendingAgreement = useRef<{ fingerprint: string; key: string } | null>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const statusConfirmationCancel = useRef<HTMLButtonElement>(null)
  const statusConfirmationOrigin = useRef<HTMLElement | null>(null)
  const busyRef = useRef('')
  const coordinator = useRef(new ChatPollRequestCoordinator())
  const activeScope = useRef<ChatPollScopeToken | null>(null)
  const endpoint = `/api/chat-polls/${roomKind}/${encodeURIComponent(roomId)}`
  const request = useCallback<ChatPollTransport>((path, init) => transport
    ? transport(path, init)
    : fetch(path, init), [transport])

  const invalidateAccountBoundary = useCallback((reloadForSignedInAccount: boolean) => {
    dirtySelections.current.clear()
    handledComposerRequest.current = latestComposerRequest.current
    const scope = activeScope.current
    if (scope !== null) coordinator.current.leaveScope(scope)
    activeScope.current = null
    busyRef.current = ''
    setBoard(null); setSelections({}); setLoadError('unauthenticated'); setActionError(''); setBusy(''); setLoading(false)
    setDraft(emptyDraft()); setComposerOpen(false); setPreview(false); setDraftError('')
    setStatusConfirmation(null); setAgreementTarget(null); setAgreementSummary('')
    statusConfirmationOrigin.current = null
    pendingCreate.current = null; pendingAgreement.current = null
    if (reloadForSignedInAccount) setAuthScopeRevision(current => current + 1)
  }, [])

  const load = useCallback(async (quiet = false, requestedScope = activeScope.current) => {
    if (!transport && !isChatPollId(authAccount)) return false
    if (requestedScope === null) return false
    const token = coordinator.current.beginRead(requestedScope)
    if (!token) return false
    if (!quiet) setLoading(true)
    try {
      const response = await request(endpoint, { cache: 'no-store', headers: !transport && authAccount ? { 'X-Expected-Account': authAccount } : {} })
      const payload = await response.json().catch(() => null)
      const data = payloadValue(payload, 'data')
      const parsed = parseChatPollBoard(data)
      const viewerBinding = payloadValue(payload, 'viewer_binding')
      if (!transport && authAccountRef.current !== authAccount) return false
      if (!response.ok || !parsed || parsed.roomId !== roomId || !isChatPollId(viewerBinding)) {
        const failure = new Error(responseError(payload)) as Error & { status?: number }
        failure.status = response.status
        throw failure
      }
      if (!transport && viewerBinding !== authAccount) {
        invalidateAccountBoundary(false)
        return false
      }
      const accepted = coordinator.current.acceptRead(token, viewerBinding)
      if (accepted.accepted) {
        if (accepted.viewerChanged) {
          dirtySelections.current.clear()
          setDraft(emptyDraft()); setComposerOpen(false); setPreview(false); setDraftError('')
          setStatusConfirmation(null)
          pendingCreate.current = null; pendingAgreement.current = null
        }
        setBoard(parsed)
        setLoadError('')
        setSelections(current => mergePollSelections(parsed.polls, current, dirtySelections.current))
      }
      return accepted.accepted
    } catch (error) {
      const code = error instanceof Error ? error.message : 'community_unavailable'
      const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0
      const accessLost = status === 401 || status === 403 || /unauthenticated|forbidden|membership_required|blocked/.test(code)
      if (accessLost && coordinator.current.revokeRead(token)) {
        setBoard(null); setSelections({}); setLoadError(code); setLoading(false)
        setDraft(emptyDraft()); setComposerOpen(false); setPreview(false); setDraftError('')
        setStatusConfirmation(null)
        pendingCreate.current = null; pendingAgreement.current = null; busyRef.current = ''; setBusy('')
      } else if (coordinator.current.isReadCurrent(token)) {
        setLoadError(code)
        if (!quiet) setBoard(null)
      }
      return false
    } finally {
      if (coordinator.current.isReadCurrent(token)) setLoading(false)
    }
  }, [authAccount,endpoint,invalidateAccountBoundary,request,roomId,transport])

  useEffect(() => {
    if (!transport && !isChatPollId(authAccount)) {
      setLoading(authAccount === undefined)
      return
    }
    const scopeCoordinator = coordinator.current
    dirtySelections.current.clear()
    const scope = scopeCoordinator.enterScope()
    activeScope.current = scope
    busyRef.current = ''
    setBoard(null); setSelections({}); setLoadError(''); setActionError(''); setBusy(''); setLoading(true)
    setDraft(emptyDraft()); setComposerOpen(false); setPreview(false); setDraftError('')
    setStatusConfirmation(null)
    pendingCreate.current = null; pendingAgreement.current = null
    void load(false, scope)
    const refresh = () => { if (document.visibilityState === 'visible' && !busyRef.current) void load(true, scope) }
    const timer = window.setInterval(refresh, 8000)
    window.addEventListener('focus', refresh)
    return () => {
      scopeCoordinator.leaveScope(scope)
      if (activeScope.current === scope) activeScope.current = null
      busyRef.current = ''
      window.clearInterval(timer); window.removeEventListener('focus', refresh)
    }
  }, [authAccount,authScopeRevision,load,transport])

  useEffect(() => {
    if (transport) return
    let active = true
    let authEventSeen = false
    let knownUserId: string | null | undefined
    try {
      const supabase = createClient()
      const observeAccount = (nextUserId: string | null) => {
        if (!active) return
        const crossedBoundary = knownUserId !== nextUserId
        knownUserId = nextUserId
        authAccountRef.current = nextUserId
        if (crossedBoundary) invalidateAccountBoundary(false)
        setAuthAccount(nextUserId)
      }
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        authEventSeen = true
        observeAccount(session?.user.id ?? null)
      })
      void supabase.auth.getUser().then(({ data, error }) => {
        if (!active || authEventSeen) return
        if (error) observeAccount(null)
        else observeAccount(data.user?.id ?? null)
      }).catch(() => { if (active && !authEventSeen) observeAccount(null) })
      return () => { active = false; authAccountRef.current = undefined; subscription.unsubscribe() }
    } catch {
      invalidateAccountBoundary(false)
      authAccountRef.current = null; setAuthAccount(null)
      return () => { active = false }
    }
  }, [invalidateAccountBoundary, transport])

  useEffect(() => {
    if (!composerOpen) return
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
    titleInput.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busyRef.current) setComposerOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('keydown', closeOnEscape); if (origin?.isConnected) origin.focus() }
  }, [composerOpen])

  const modalOpen = composerOpen || !!statusConfirmation
  useEffect(() => {
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const dialog = composerDialog.current ?? confirmationDialog.current
      if (!dialog) return
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0)
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (!dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', trapFocus) }
  }, [modalOpen])

  useEffect(() => {
    if (!statusConfirmation) return
    statusConfirmationCancel.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeStatusConfirmation()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [statusConfirmation])

  async function post(path: string, body: Record<string, unknown>, key: string) {
    if(readOnly)return false
    const scope = activeScope.current
    if (scope === null || busyRef.current) return false
    const token = coordinator.current.beginMutation(scope)
    if (!token) return false
    busyRef.current = key; setBusy(key); setActionError('')
    try {
      const response = await request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, expected_viewer_binding: token.viewerBinding }),
      })
      const payload = await response.json().catch(() => null)
      const viewerBinding = payloadValue(payload, 'viewer_binding')
      if (!response.ok) {
        const code = responseError(payload)
        if ((response.status === 401 || response.status === 403) && coordinator.current.revokeMutation(token)) {
          setBoard(null); setSelections({}); setLoadError(code); setLoading(false)
          setDraft(emptyDraft()); setComposerOpen(false); setPreview(false); setDraftError('')
          setStatusConfirmation(null)
          pendingCreate.current = null; pendingAgreement.current = null; busyRef.current = ''; setBusy('')
        }
        throw new Error(code)
      }
      if (!isChatPollId(viewerBinding)) {
        if (coordinator.current.revokeMutation(token)) {
          setBoard(null); setSelections({}); setLoadError('community_unavailable'); setLoading(false)
          setDraft(emptyDraft()); setComposerOpen(false); setPreview(false); setDraftError('')
          setStatusConfirmation(null)
          pendingCreate.current = null; pendingAgreement.current = null; busyRef.current = ''; setBusy('')
        }
        return false
      }
      const accepted = coordinator.current.acceptMutation(token, viewerBinding)
      if (!accepted.accepted) {
        if (accepted.viewerChanged && coordinator.current.revokeMutation(token)) {
          setBoard(null); setSelections({}); setLoadError('unauthenticated'); setLoading(false)
          setDraft(emptyDraft()); setComposerOpen(false); setPreview(false); setDraftError('')
          setStatusConfirmation(null)
          pendingCreate.current = null; pendingAgreement.current = null; busyRef.current = ''; setBusy('')
        }
        return false
      }
      if (key.startsWith('vote:')) dirtySelections.current.delete(key.slice(5))
      const loaded = await load(true, scope)
      return loaded && coordinator.current.matchesViewer(scope, token.viewerBinding)
    } catch (error) {
      if (coordinator.current.matchesViewer(scope, token.viewerBinding)) {
        setActionError(error instanceof Error ? error.message : 'community_unavailable')
      }
      return false
    } finally {
      if (coordinator.current.endMutation(token)) { busyRef.current = ''; setBusy('') }
    }
  }

  function draftPayload() {
    const fingerprint = JSON.stringify(draft)
    if (pendingCreate.current?.fingerprint !== fingerprint) {
      pendingCreate.current = { fingerprint, key: crypto.randomUUID() }
    }
    return parseCreateChatPollInput({
      purpose: draft.purpose, title: draft.title, selection_mode: draft.selectionMode,
      options: draft.options, idempotency_key: pendingCreate.current.key,
    })
  }

  function showPreview() {
    const input = draftPayload()
    if (!input) {
      setDraftError('제목 2자 이상, 서로 다른 선택지 2~8개를 입력해 주세요.')
      return
    }
    setDraftError(''); setPreview(true)
  }

  async function publish() {
    const input = draftPayload()
    if (!input) { setPreview(false); setDraftError('투표 내용을 다시 확인해 주세요.'); return }
    const succeeded = await post(endpoint, {
      purpose: input.purpose, title: input.title, selection_mode: input.selectionMode,
      options: input.options, idempotency_key: input.idempotencyKey,
    }, 'create')
    if (succeeded) {
      setDraft(emptyDraft()); setPreview(false); setDraftError(''); setComposerOpen(false)
      setExpanded(true)
      window.requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }))
      pendingCreate.current = null
    }
  }

  function updateOption(index: number, value: string) {
    setDraft(current => ({ ...current, options: current.options.map((option, item) => item === index ? value : option) }))
    setPreview(false); setDraftError(''); pendingCreate.current = null
  }

  function toggleSelection(poll: ChatPoll, optionId: string) {
    if (poll.status !== 'open' || busy) return
    dirtySelections.current.add(poll.id)
    setSelections(current => {
      const chosen = current[poll.id] ?? selectedIds(poll)
      const next = poll.selectionMode === 'single'
        ? [optionId]
        : chosen.includes(optionId) ? chosen.filter(id => id !== optionId) : [...chosen, optionId]
      return { ...current, [poll.id]: next }
    })
  }

  async function vote(poll: ChatPoll) {
    const optionIds = selections[poll.id] ?? selectedIds(poll)
    if (optionIds.length === 0) { setActionError('invalid_activity_poll_options'); return }
    await post(`${endpoint}/${poll.id}/vote`, { option_ids: optionIds }, `vote:${poll.id}`)
  }

  function closeStatusConfirmation() {
    setStatusConfirmation(null)
    const origin = statusConfirmationOrigin.current
    statusConfirmationOrigin.current = null
    window.requestAnimationFrame(() => origin?.focus())
  }

  function changeStatus(poll: ChatPoll, action: 'close' | 'cancel') {
    if (poll.status !== 'open' || busyRef.current) return
    statusConfirmationOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setComposerOpen(false)
    setStatusConfirmation({ pollId: poll.id, revision: poll.revision, action, title: poll.title })
    setActionError('')
  }

  async function confirmStatusChange() {
    const confirmation = statusConfirmation
    if (!confirmation) return
    const succeeded = await post(`${endpoint}/${confirmation.pollId}/${confirmation.action}`, {
      expected_revision: confirmation.revision,
    }, `${confirmation.action}:${confirmation.pollId}`)
    if (succeeded) closeStatusConfirmation()
  }

  function startAgreement(poll: ChatPoll) {
    const outcome = uniqueWinner(poll)
    if (outcome.kind !== 'winner' || !outcome.option) return
    setAgreementTarget(poll.id)
    setAgreementSummary(`${outcome.option.label}으로 의견을 모으는 제안`)
    pendingAgreement.current = null
    setActionError('')
  }

  async function proposeAgreement(poll: ChatPoll) {
    const outcome = uniqueWinner(poll)
    if (outcome.kind !== 'winner' || !outcome.option) return
    const summary = agreementSummary.trim()
    if (summary.length < 2 || summary.length > 160) { setActionError('invalid_activity_poll_agreement'); return }
    const fingerprint = `${poll.id}|${poll.revision}|${outcome.option.id}|${summary}`
    if (pendingAgreement.current?.fingerprint !== fingerprint) {
      pendingAgreement.current = { fingerprint, key: crypto.randomUUID() }
    }
    const succeeded = await post(`${endpoint}/${poll.id}/agreement`, {
      selected_option_id: outcome.option.id,
      expected_revision: poll.revision,
      idempotency_key: pendingAgreement.current.key,
      summary,
    }, `agreement:${poll.id}`)
    if (succeeded) {
      setAgreementTarget(null); setAgreementSummary(''); pendingAgreement.current = null
    }
  }

  async function confirmAgreement(poll: ChatPoll) {
    if (!poll.agreement) return
    await post(`${endpoint}/${poll.id}/agreement/${poll.agreement.id}/confirm`, {
      expected_version: poll.agreement.version,
    }, `confirm:${poll.agreement.id}`)
  }

  const currentAgreementPoll = board?.polls.find(poll => poll.agreement) ?? null

  useEffect(() => {
    if(readOnly){setComposerOpen(false);setStatusConfirmation(null);return}
    if (!composerRequest || composerRequest === handledComposerRequest.current) return
    if (!board) { setExpanded(true); return }
    handledComposerRequest.current = composerRequest
    setStatusConfirmation(null); setComposerOpen(true); setPreview(false); setDraftError('')
  }, [composerRequest, board, readOnly])

  return <section ref={sectionRef} className={styles.section} aria-labelledby="activity-room-polls-title">
    <div className={styles.heading}>
      <button type="button" className={styles.boardToggle} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <span className={styles.boardIcon}><BarChart3 size={19} /></span>
        <span><strong id="activity-room-polls-title">대화 속 투표</strong><small>{loading ? '불러오는 중' : loadError ? '연결 확인이 필요해요' : board?.polls.length ? `${board.polls.filter(poll => poll.status === 'open').length}개 진행 중 · 모두 보기` : '우리끼리 직접 만들어요'}</small></span>
        <ChevronDown size={17} className={expanded ? styles.chevronOpen : ''} />
      </button>
      {board ? <button type="button" disabled={readOnly} className={styles.quickCreate} aria-label="채팅방에 투표 올리기" onClick={() => { setStatusConfirmation(null); setComposerOpen(true); setPreview(false); setDraftError('') }}><Plus size={18} /><span>만들기</span></button> : null}
    </div>

    {expanded ? <div className={styles.boardBody}>
    <div className={styles.boardCaption}><span>멤버가 직접 올린 투표</span><button type="button" className={styles.refresh} onClick={() => void load()} disabled={!!busy} aria-label="투표 새로고침"><RefreshCw size={15} /></button></div>

    {currentAgreementPoll?.agreement ? <aside className={styles.pinned} aria-label="고정된 합의 제안">
      <div className={styles.pinnedTitle}><Pin size={17} /><strong>고정된 합의 제안 v{currentAgreementPoll.agreement.version}</strong></div>
      <p>{currentAgreementPoll.agreement.summary}</p>
      <p className={styles.meta}>{currentAgreementPoll.agreement.confirmationCount}/{currentAgreementPoll.agreement.requiredCount}명 확인 · {currentAgreementPoll.agreement.status === 'confirmed' ? '전원 확인 완료' : '확인 진행 중'}</p>
      {!currentAgreementPoll.agreement.membershipCurrent ? <p className={styles.warning}>멤버가 바뀌어 새 버전이 필요해요. 이 버전은 자동으로 현재 약속이 되지 않아요.</p> : null}
      {currentAgreementPoll.agreement.status === 'proposal' && currentAgreementPoll.agreement.membershipCurrent && !currentAgreementPoll.agreement.confirmedByMe
        ? <button type="button" className={styles.primary} disabled={readOnly || !!busy} onClick={() => void confirmAgreement(currentAgreementPoll)}>이 버전 확인하기</button> : null}
      {currentAgreementPoll.agreement.confirmedByMe && currentAgreementPoll.agreement.status === 'proposal' ? <p className={styles.confirmedMine}><Check size={15} />나는 이 버전을 확인했어요. 다른 멤버의 확인을 기다려요.</p> : null}
    </aside> : null}

    {loading && !board ? <div className={styles.state} role="status">투표를 불러오고 있어요.</div> : null}
    {loadError && !board ? <div className={styles.error} role="alert"><strong>{/forbidden/.test(loadError) ? '이 방의 투표를 볼 수 없어요' : '투표 연결을 확인해 주세요'}</strong><p>{chatPollErrorMessage(loadError)}</p><button type="button" className={styles.secondary} onClick={() => void load()} disabled={!!busy}>다시 시도</button></div> : null}
    {loadError && board ? <div className={styles.inlineError} role="alert">새 결과를 불러오지 못했어요. <button type="button" onClick={() => void load(true)}>다시 시도</button></div> : null}
    {actionError ? <div className={styles.inlineError} role="alert"><span>{chatPollErrorMessage(actionError)}</span><button type="button" onClick={() => setActionError('')}>닫기</button></div> : null}

    {board && board.polls.length === 0 ? <div className={styles.state}><BarChart3 size={26} /><strong>아직 투표가 없어요</strong><span>먹고 싶은 메뉴부터 만날 시간까지.<br />궁금한 걸 자유롭게 물어보세요.</span></div> : null}
    {board ? <div className={styles.pollList}>{board.polls.map(poll => {
      const chosen = selections[poll.id] ?? selectedIds(poll)
      const outcome = uniqueWinner(poll)
      const hasVoted = selectedIds(poll).length > 0
      return <article className={styles.poll} key={poll.id}>
        <div className={styles.pollTop}><span className={styles.pollAuthor}><BarChart3 size={15}/>{poll.creatorAlias}의 투표</span><span className={`${styles.status} ${styles[poll.status]}`}>{poll.status === 'open' ? '진행 중' : poll.status === 'closed' ? '마감됨' : '취소됨'}</span></div>
        <h3>{poll.title}</h3>
        <p className={styles.meta}>{purposeLabels[poll.purpose]} · {poll.selectionMode === 'single' ? '한 개 선택' : '여러 개 선택'} · {poll.ballotCount}명 참여</p>
        <fieldset className={styles.options} disabled={readOnly || poll.status !== 'open' || !!busy}>
          <legend className={styles.srOnly}>{poll.title}</legend>
          {poll.options.map(option => {
            const active = chosen.includes(option.id)
            const width = poll.ballotCount ? Math.min(100, option.voteCount / poll.ballotCount * 100) : 0
            return <label className={`${styles.option} ${active ? styles.optionActive : ''}`} key={option.id}>
              <input type={poll.selectionMode === 'single' ? 'radio' : 'checkbox'} name={`poll-${poll.id}`} checked={active} onChange={() => toggleSelection(poll, option.id)} />
              <span className={styles.optionCopy}><span>{option.label}</span><small>{option.voteCount}표</small><span className={styles.bar} aria-hidden="true"><span style={{ width: `${width}%` }} /></span></span>
            </label>
          })}
        </fieldset>
        {poll.status === 'open' ? <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={readOnly || !!busy || chosen.length === 0} onClick={() => void vote(poll)}>{busy === `vote:${poll.id}` ? '저장 중…' : hasVoted ? '선택 바꾸기' : '투표하기'}</button>
          {poll.isCreator ? <details className={styles.manage}><summary>내 투표 관리</summary><div><button type="button" className={styles.secondary} disabled={readOnly || !!busy} onClick={() => changeStatus(poll, 'close')}>투표 마감</button><button type="button" className={styles.danger} disabled={readOnly || !!busy} onClick={() => changeStatus(poll, 'cancel')}>투표 취소</button></div></details> : null}
        </div> : null}
        {poll.status === 'closed' ? <div className={styles.outcome}>
          {outcome.kind === 'empty' ? <p>응답이 없어 합의로 확인하지 않아요.</p> : outcome.kind === 'tied' ? <p>동률이라 합의로 확인하지 않아요. 대화를 더 나눠 주세요.</p> : <p><strong>{outcome.option?.label}</strong>이 가장 많은 표를 받았어요. 이 결과 자체는 아직 약속이 아니에요.</p>}
          {poll.isCreator && outcome.kind === 'winner' ? agreementTarget === poll.id
            ? <div className={styles.agreementForm}><label>고정할 합의 제안<input value={agreementSummary} maxLength={160} onChange={event => { setAgreementSummary(event.target.value); pendingAgreement.current = null }} /></label><div className={styles.actions}><button type="button" className={styles.primary} disabled={readOnly || !!busy || agreementSummary.trim().length < 2} onClick={() => void proposeAgreement(poll)}>합의 제안으로 고정</button><button type="button" className={styles.secondary} disabled={readOnly || !!busy} onClick={() => setAgreementTarget(null)}>취소</button></div></div>
            : <button type="button" className={styles.secondary} disabled={readOnly || !!busy} onClick={() => startAgreement(poll)}>{poll.agreement ? '새 합의 버전 제안' : '합의 제안으로 고정'}</button> : null}
        </div> : null}
      </article>
    })}</div> : null}

    {board ? <button type="button" disabled={readOnly} className={styles.openComposer} onClick={() => { setStatusConfirmation(null); setComposerOpen(true); setPreview(false); setDraftError('') }}><Plus size={18} />채팅방에 투표 올리기</button> : null}
    <details className={styles.advisory}><summary>투표 이용 안내</summary><p><strong>결과는 제안이에요.</strong> 질문과 선택지는 멤버가 직접 작성합니다. 투표만으로 일정·장소·역할, 매칭이나 결제가 자동으로 바뀌지 않아요.</p></details>
    </div> : null}

    {statusConfirmation ? <div className={styles.backdrop} onMouseDown={event => { if (event.currentTarget === event.target && !busyRef.current) closeStatusConfirmation() }}>
      <div ref={confirmationDialog} tabIndex={-1} className={`${styles.sheet} ${styles.confirmationSheet}`} role="dialog" aria-modal="true" aria-labelledby="poll-status-confirmation-title" aria-describedby="poll-status-confirmation-description">
        <div className={styles.sheetHeading}><div><p className={styles.eyebrow}>{statusConfirmation.action === 'close' ? '선택 결과를 그대로 남겨요' : '이 투표를 더 진행하지 않아요'}</p><h2 id="poll-status-confirmation-title">{statusConfirmation.action === 'close' ? '투표를 마감할까요?' : '투표를 취소할까요?'}</h2></div><button type="button" className={styles.close} aria-label="상태 변경 확인 닫기" disabled={!!busy} onClick={closeStatusConfirmation}><X size={20} /></button></div>
        <p className={styles.confirmationTitle}>{statusConfirmation.title}</p>
        <p id="poll-status-confirmation-description" className={styles.confirmationCopy}>{statusConfirmation.action === 'close' ? '마감 뒤에는 멤버가 표를 바꿀 수 없어요. 가장 많은 표도 자동 확정이 아닌 제안으로만 남아요.' : '취소된 투표는 다시 열 수 없고, 기존 표는 취소 상태로 남아요.'}</p>
        <div className={styles.sheetActions}><button ref={statusConfirmationCancel} type="button" className={styles.secondary} disabled={readOnly || !!busy} onClick={closeStatusConfirmation}>계속 투표하기</button><button type="button" className={statusConfirmation.action === 'cancel' ? styles.dangerConfirm : styles.primary} disabled={readOnly || !!busy} onClick={() => void confirmStatusChange()}>{busy === `${statusConfirmation.action}:${statusConfirmation.pollId}` ? '처리 중…' : statusConfirmation.action === 'close' ? '투표 마감하기' : '투표 취소하기'}</button></div>
      </div>
    </div> : null}

    {composerOpen ? <div className={styles.backdrop} onMouseDown={event => { if (event.currentTarget === event.target && !busy) setComposerOpen(false) }}>
      <div ref={composerDialog} tabIndex={-1} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="poll-composer-title">
        <div className={styles.sheetHandle} aria-hidden="true"/><div className={styles.sheetHeading}><div><p className={styles.eyebrow}>{preview ? '이대로 대화방에 올릴까요?' : '한 번 물어보면, 함께 정해져요'}</p><h2 id="poll-composer-title">{preview ? '투표 미리보기' : '어떤 게 궁금해요?'}</h2></div><button type="button" className={styles.close} aria-label="투표 만들기 닫기" disabled={!!busy} onClick={() => setComposerOpen(false)}><X size={20} /></button></div>
        {preview ? <div className={styles.preview}><span className={styles.purpose}>{purposeLabels[draft.purpose]}</span><h3>{draft.title.trim()}</h3><p>{draft.selectionMode === 'single' ? '한 개 선택' : '여러 개 선택'}</p>{draft.options.map((option, index) => <div className={styles.previewOption} key={`${index}-${option}`}>{option.trim()}</div>)}</div>
        : <div className={styles.fields}>
          <label>질문<input ref={titleInput} value={draft.title} maxLength={100} placeholder="친구들에게 물어보고 싶은 건?" onChange={event => { setDraft(current => ({ ...current, title: event.target.value })); setDraftError(''); setPreview(false); pendingCreate.current = null }} /></label>
          <fieldset><legend>선택 방식</legend><div className={styles.segment}><button type="button" aria-pressed={draft.selectionMode === 'single'} className={draft.selectionMode === 'single' ? styles.segmentActive : ''} onClick={() => { setDraft(current => ({ ...current, selectionMode: 'single' })); pendingCreate.current = null }}>한 개 선택</button><button type="button" aria-pressed={draft.selectionMode === 'multiple'} className={draft.selectionMode === 'multiple' ? styles.segmentActive : ''} onClick={() => { setDraft(current => ({ ...current, selectionMode: 'multiple' })); pendingCreate.current = null }}>여러 개 선택</button></div></fieldset>
          <fieldset><legend>선택지</legend><div className={styles.optionFields}>{draft.options.map((option, index) => <div className={styles.optionField} key={index}><input aria-label={`선택지 ${index + 1}`} value={option} maxLength={80} placeholder={purposePlaceholders[draft.purpose][Math.min(index, 1)]} onChange={event => updateOption(index, event.target.value)} />{draft.options.length > 2 ? <button type="button" aria-label={`선택지 ${index + 1} 삭제`} onClick={() => { setDraft(current => ({ ...current, options: current.options.filter((_, item) => item !== index) })); setPreview(false); pendingCreate.current = null }}><X size={17} /></button> : null}</div>)}</div>{draft.options.length < 8 ? <button type="button" className={styles.addOption} onClick={() => { setDraft(current => ({ ...current, options: [...current.options, ''] })); pendingCreate.current = null }}><Plus size={16} />선택지 추가</button> : null}</fieldset>
          <details className={styles.classification}><summary>분류 더하기 · {purposeLabels[draft.purpose]}</summary><fieldset><legend className={styles.srOnly}>투표 분류</legend><div className={styles.segment}>{(Object.keys(purposeLabels) as ChatPollPurpose[]).map(purpose => <button type="button" aria-pressed={draft.purpose === purpose} className={draft.purpose === purpose ? styles.segmentActive : ''} key={purpose} onClick={() => { setDraft(current => ({ ...current, purpose })); pendingCreate.current = null }}>{purposeLabels[purpose]}</button>)}</div></fieldset></details>
        </div>}
        {draftError ? <p className={styles.formError} role="alert">{draftError}</p> : null}
        {actionError && composerOpen ? <p className={styles.formError} role="alert">{chatPollErrorMessage(actionError)} 다시 시도해도 작성 내용은 유지돼요.</p> : null}
        <div className={styles.sheetActions}>{preview ? <><button type="button" className={styles.secondary} disabled={readOnly || !!busy} onClick={() => setPreview(false)}>수정하기</button><button type="button" className={styles.primary} disabled={readOnly || !!busy} onClick={() => void publish()}>{busy === 'create' ? '게시 중…' : '투표 게시하기'}</button></> : <button type="button" className={styles.primary} onClick={showPreview}>미리보기</button>}</div>
      </div>
    </div> : null}
  </section>
}
