'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, LockKeyhole, MessageCircle, Phone, RefreshCw, Send } from 'lucide-react'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import ChatComposerActions from '@/components/chat-polls/ChatComposerActions'
import { mergeMessages, parseFriendChatPage, type ConversationMessage } from '@/lib/friends/conversation-state'
import { isFriendConversationInvalidation } from '@/lib/friends/realtime-invalidation'
import { revokeFriendDirectChatState } from '@/lib/matching/friend-direct-chat'
import { resolveMutationAttempt, type MutationAttempt } from '@/lib/matching/continuation-journey-client'
import { createClient } from '@/lib/supabase'

type VoiceInvitation = { id: string; fromUserId: string; displayName: string; expiresAt: string }

export default function FriendChatRoom({ friendUserId }: { friendUserId: string }) {
  const [friendName, setFriendName] = useState('친구 정보 확인 중')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [peerLastReadMessageId, setPeerLastReadMessageId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [access, setAccess] = useState<'checking' | 'active' | 'revoked'>('checking')
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [pollComposerRequest, setPollComposerRequest] = useState(0)
  const [voiceWorking, setVoiceWorking] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const [voiceRulesChecked, setVoiceRulesChecked] = useState(false)
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null)
  const [incomingVoice, setIncomingVoice] = useState<VoiceInvitation[]>([])
  const [voiceToolsOpen, setVoiceToolsOpen] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const mounted = useRef(true)
  const attempt = useRef<MutationAttempt | null>(null)
  const voiceAttempt = useRef<string | null>(null)
  const acceptVoiceAttempts = useRef(new Map<string, string>())
  const sendLock = useRef(false)
  const lastMarkedRead = useRef<string | null>(null)
  const scroller = useRef<HTMLElement>(null)
  const endpoint = `/api/friends/${encodeURIComponent(friendUserId)}/chat`
  const voiceAttention = incomingVoice.length > 0 || Boolean(voiceSessionId)

  const revoke = useCallback(() => {
    const next = revokeFriendDirectChatState(sequence.current)
    sequence.current = next.refreshSequence
    setAccess(next.access); setMessages([]); setDraft(''); setIncomingVoice([])
    attempt.current = null
    setError('로그인과 친구 수락 상태를 확인해 주세요. 현재는 이 대화를 볼 수 없어요.')
    setLoading(false)
  }, [])

  const loadVoiceInvitations = useCallback(async () => {
    try {
      const [response, queueResponse] = await Promise.all([
        fetch('/api/voice/friend-invitations', { cache: 'no-store' }),
        fetch('/api/voice/queue', { cache: 'no-store' }),
      ])
      const [body, queue] = await Promise.all([response.json().catch(() => null), queueResponse.json().catch(() => null)])
      setVoiceSessionId(queueResponse.ok && typeof queue?.sessionId === 'string' ? queue.sessionId : null)
      if (!response.ok || !Array.isArray(body?.invitations)) return
      setIncomingVoice(body.invitations.filter((row: unknown): row is VoiceInvitation => {
        if (!row || typeof row !== 'object') return false
        const value = row as Record<string, unknown>
        return typeof value.id === 'string' && value.fromUserId === friendUserId
          && typeof value.displayName === 'string' && typeof value.expiresAt === 'string'
      }))
    } catch { /* chat remains usable when voice service is unavailable */ }
  }, [friendUserId])

  const refresh = useCallback(async () => {
    const current = ++sequence.current
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      if (!mounted.current || current !== sequence.current) return
      if (response.status === 401 || response.status === 403) { revoke(); return }
      const payload = await response.json().catch(() => null)
      const page = response.ok ? parseFriendChatPage(payload) : null
      if (!page) throw new Error('invalid_response')
      setAccess('active')
      setFriendName(page.friend.friendRecognitionName ?? page.friend.displayName)
      setMessages((existing) => mergeMessages(existing, page.messages))
      setNextCursor((existing) => existing ?? page.nextCursor)
      setPeerLastReadMessageId(page.peerLastReadMessageId)
      setError('')
      void loadVoiceInvitations()
    } catch {
      if (mounted.current && current === sequence.current) {
        setAccess('checking')
        setError('대화를 불러오지 못했어요. 다시 불러온 뒤 메시지를 보낼 수 있어요.')
      }
    } finally { if (mounted.current && current === sequence.current) setLoading(false) }
  }, [endpoint, loadVoiceInvitations, revoke])

  const markRead = useCallback(async (lastMessageId: string) => {
    if (lastMarkedRead.current === lastMessageId) return
    try {
      const response = await fetch(`${endpoint}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ last_message_id: lastMessageId }) })
      if (response.ok) lastMarkedRead.current = lastMessageId
    } catch { /* next visible refresh retries */ }
  }, [endpoint])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const wake = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(wake, 8000)
    document.addEventListener('visibilitychange', wake); window.addEventListener('online', wake); window.addEventListener('pageshow', wake)
    return () => { mounted.current = false; sequence.current += 1; window.clearInterval(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); window.removeEventListener('pageshow', wake) }
  }, [refresh])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    try {
      const supabase = createClient()
      const channel = supabase
        .channel(`friend-chat-invalidation:${crypto.randomUUID()}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'friend_conversation_revisions',
        }, (payload) => {
          if (document.visibilityState === 'visible'
            && isFriendConversationInvalidation(payload.new, friendUserId)) void refresh()
        })
        .subscribe()
      unsubscribe = () => { void channel.unsubscribe() }
    } catch {
      // The visibility, online, pageshow, and 8-second polling fallback remains active.
    }
    return () => { unsubscribe?.() }
  }, [friendUserId, refresh])

  useEffect(() => {
    if (document.visibilityState !== 'visible') return
    const last = [...messages].reverse().find((row) => !row.isMine)
    if (last) void markRead(last.id)
  }, [markRead, messages])

  useEffect(() => {
    if (voiceAttention) setVoiceToolsOpen(true)
  }, [voiceAttention])

  useEffect(() => {
    const element = scroller.current
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 180) element.scrollTop = element.scrollHeight
  }, [messages.length])

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return
    const element = scroller.current; const previousHeight = element?.scrollHeight ?? 0
    setLoadingOlder(true)
    try {
      const response = await fetch(`${endpoint}?before=${encodeURIComponent(nextCursor)}&limit=50`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      const page = response.ok ? parseFriendChatPage(payload) : null
      if (!page) throw new Error('invalid_response')
      setMessages((current) => mergeMessages(current, page.messages)); setNextCursor(page.nextCursor)
      requestAnimationFrame(() => { if (element) element.scrollTop += element.scrollHeight - previousHeight })
    } catch { setError('이전 대화를 불러오지 못했어요.') }
    finally { setLoadingOlder(false) }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = draft.replace(/\r\n?/g, '\n').trim()
    if (access !== 'active' || !message || [...message].length > 1000 || sendLock.current) return
    sendLock.current = true; setSending(true); setError('')
    attempt.current = resolveMutationAttempt(attempt.current, `${friendUserId}:${message}`)
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, idempotency_key: attempt.current.key }) })
      if (!mounted.current) return
      if (response.status === 401 || response.status === 403) { revoke(); return }
      const payload = await response.json().catch(() => null)
      if (!response.ok || typeof payload?.message_id !== 'string') { setError(payload?.error === 'rate_limited' ? '메시지를 너무 빠르게 보내고 있어요. 1분 뒤 다시 시도해 주세요.' : payload?.error === 'capacity_reached' ? '이 대화방의 저장 한도에 도달했어요.' : '전송 결과를 확인하지 못했어요. 같은 내용으로 다시 누르면 중복 없이 확인합니다.'); return }
      attempt.current = null; setDraft((current) => current.replace(/\r\n?/g, '\n').trim() === message ? '' : current); await refresh()
    } catch { if (mounted.current) setError('연결이 끊겼어요. 작성한 내용은 이 화면에 남아 있습니다. 다시 전송해 주세요.') }
    finally { sendLock.current = false; if (mounted.current) setSending(false) }
  }

  async function inviteVoice() {
    if (voiceWorking) return
    if (!voiceRulesChecked) { setVoiceNotice('먼저 서로 편안하게 이야기하기 위한 대화 약속을 확인해 주세요.'); return }
    setVoiceWorking(true); setVoiceNotice('')
    voiceAttempt.current ??= crypto.randomUUID()
    try {
      const rulesResponse = await fetch('/api/voice/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!rulesResponse.ok) { setVoiceNotice('대화 약속을 저장하지 못했어요. 다시 시도해 주세요.'); return }
      const response = await fetch('/api/voice/friend-invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendUserId, idempotencyKey: voiceAttempt.current }) })
      const body = await response.json().catch(() => null)
      if (!response.ok || typeof body?.invitationId !== 'string' || body?.status !== 'pending' || typeof body?.expiresAt !== 'string') { setVoiceNotice('통화 초대를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.'); return }
      voiceAttempt.current = null; setVoiceNotice('통화 초대를 보냈어요. 친구가 수락하면 음성방이 열려요.')
    } catch { setVoiceNotice('통화 서버에 연결하지 못했어요. 다시 시도해 주세요.') }
    finally { setVoiceWorking(false) }
  }

  async function acceptVoice(invitationId: string) {
    if (voiceWorking) return
    if (!voiceRulesChecked) { setVoiceNotice('먼저 서로 편안하게 이야기하기 위한 대화 약속을 확인해 주세요.'); return }
    setVoiceWorking(true); setVoiceNotice('')
    const key = acceptVoiceAttempts.current.get(invitationId) ?? crypto.randomUUID(); acceptVoiceAttempts.current.set(invitationId, key)
    try {
      const rulesResponse = await fetch('/api/voice/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!rulesResponse.ok) { setVoiceNotice('대화 약속을 저장하지 못했어요. 다시 시도해 주세요.'); return }
      const response = await fetch(`/api/voice/friend-invitations/${encodeURIComponent(invitationId)}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: key }) })
      const body = await response.json().catch(() => null)
      if (!response.ok || typeof body?.sessionId !== 'string' || typeof body?.roomId !== 'string') { setVoiceNotice('통화 초대를 수락하지 못했어요. 만료 여부를 확인해 주세요.'); return }
      acceptVoiceAttempts.current.delete(invitationId)
      window.location.assign(`/community/voice/session/${encodeURIComponent(body.sessionId)}`)
    } catch { setVoiceNotice('통화 서버에 연결하지 못했어요. 다시 시도해 주세요.') }
    finally { setVoiceWorking(false) }
  }

  const peerReadIndex = peerLastReadMessageId ? messages.findIndex((row) => row.id === peerLastReadMessageId) : -1
  return <div className="flex min-h-[calc(100dvh-10rem)] flex-col rounded-2xl bg-[#FFF8F3] p-2 sm:p-3">
    <section className="flex gap-3 rounded-[14px] border border-[#EEDFD6] bg-white/80 p-3"><LockKeyhole size={18} className="shrink-0 text-boot-primary" /><p className="text-xs leading-5 text-boot-body">{access === 'active' ? <><strong>{friendName}</strong>님과 서로 수락한 친구 대화예요. 친구 관계가 끝나면 열람과 전송이 차단됩니다.</> : <><strong>친구 정보 확인 중</strong><br />대화 조회가 성공한 뒤에만 친구 이름과 메시지를 보여드려요.</>}</p></section>
    <details open={voiceToolsOpen} onToggle={(event) => { if (voiceAttention && !event.currentTarget.open) { event.currentTarget.open = true; return } setVoiceToolsOpen(event.currentTarget.open) }} className="mt-2 rounded-[14px] border border-[#EEDFD6] bg-white/70 px-3"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-boot-body"><span className="flex items-center gap-2"><Phone size={16} className="text-boot-primary" />음성 통화와 대화 약속</span><span className="text-[11px] text-boot-primary">{voiceAttention ? '확인할 통화 있음' : voiceToolsOpen ? '접기' : '열기'}</span></summary><div className="border-t border-[#F0E5DE] pb-3 pt-2"><label className="flex items-start gap-2 rounded-xl bg-[#FFF8F3] p-3 text-xs leading-5 text-boot-body"><input type="checkbox" checked={voiceRulesChecked} onChange={(event) => setVoiceRulesChecked(event.target.checked)} className="mt-1" /><span>비난·성희롱·개인정보 요구를 하지 않고, 원하지 않으면 언제든 통화를 나갈 수 있다는 대화 약속을 확인했어요. 마이크는 통화 화면에서 제가 직접 켭니다.</span></label><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" disabled={voiceWorking || access !== 'active'} onClick={() => void inviteVoice()} className="min-h-11 rounded-xl border border-boot-primary/25 bg-white text-sm font-black text-boot-primary disabled:opacity-50"><Phone size={16} className="mr-1.5 inline" />음성 통화 초대</button>{incomingVoice[0] ? <button type="button" disabled={voiceWorking} onClick={() => void acceptVoice(incomingVoice[0].id)} className="min-h-11 rounded-xl bg-boot-primary text-sm font-black text-white disabled:opacity-50"><Phone size={16} className="mr-1.5 inline" />{incomingVoice[0].displayName} 통화 수락</button> : null}{voiceSessionId ? <button type="button" onClick={() => window.location.assign(`/community/voice/session/${encodeURIComponent(voiceSessionId)}`)} className="min-h-11 rounded-xl bg-boot-ink text-sm font-black text-white sm:col-span-2"><Phone size={16} className="mr-1.5 inline" />수락된 통화 입장</button> : null}</div>{voiceNotice ? <p role="status" className="mt-2 rounded-xl bg-boot-soft p-3 text-xs font-bold text-boot-body">{voiceNotice}</p> : null}</div></details>
    {error && <div role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"><span className="flex-1">{error}</span><button type="button" onClick={() => void refresh()} aria-label="대화 다시 불러오기" className="flex h-11 w-11 shrink-0 items-center justify-center"><RefreshCw size={18} /></button></div>}
    <section ref={scroller} aria-label={`${friendName}님과의 메시지`} className="mt-3 max-h-[55dvh] min-h-56 flex-1 overflow-y-auto rounded-[14px] border border-[#EEDFD6] bg-[#FFF8F3] p-3">
      {nextCursor ? <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className="mb-3 min-h-10 w-full rounded-lg border border-boot-hairline text-xs font-black">{loadingOlder ? '불러오는 중...' : '이전 대화 보기'}</button> : null}
      {access === 'revoked' ? <p className="p-8 text-center text-sm text-boot-muted">현재 이 대화를 열 수 없어요.</p> : loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 aria-label="대화 불러오는 중" className="animate-spin text-boot-primary" /></div> : error || access !== 'active' ? <p className="p-8 text-center text-sm leading-6 text-boot-muted">대화 정보를 확인할 수 없어요.<br />다시 불러오기를 눌러 주세요.</p> : messages.length === 0 ? <div className="p-8 text-center"><MessageCircle className="mx-auto text-boot-primary" /><p className="mt-3 text-sm font-black">첫 메시지를 보내 보세요</p><p className="mt-2 text-xs leading-5 text-boot-muted">전화번호를 공개하지 않고<br />시간과 장소를 정할 수 있어요.</p></div> : <div className="space-y-2.5">{messages.map((row, index) => { const day = new Date(row.createdAt).toLocaleDateString('ko-KR'); const previousDay = index ? new Date(messages[index-1].createdAt).toLocaleDateString('ko-KR') : ''; return <div key={row.id}>{day !== previousDay ? <p className="my-3 text-center text-[11px] font-bold text-boot-muted">{day}</p> : null}<article className={`flex ${row.isMine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[78%] rounded-[14px] px-3 py-2 shadow-[0_2px_10px_rgba(91,61,45,0.04)] ${row.isMine ? 'rounded-br-[5px] bg-[#F8E3D8] text-boot-ink' : 'rounded-bl-[5px] border border-[#EEDFD6] bg-white text-boot-ink'}`}><p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{row.body}</p><div className="mt-1 flex justify-end gap-1 text-[10px] opacity-60"><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time>{row.isMine && peerReadIndex >= index ? <span>읽음</span> : null}</div></div></article></div>})}</div>}
    </section>
    {access === 'active' ? <ActivityRoomPolls roomId={friendUserId} roomKind="friends" composerRequest={pollComposerRequest} /> : null}
    {access === 'active' && <form onSubmit={send} className="mt-2 rounded-[14px] border border-[#EEDFD6] bg-white p-2 shadow-[0_2px_10px_rgba(91,61,45,0.04)]"><label htmlFor="friend-chat-message" className="sr-only">친구에게 보낼 메시지</label><div className="flex items-end gap-2"><ChatComposerActions onCreatePoll={() => setPollComposerRequest(value => value + 1)} disabled={sending} /><textarea id="friend-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} rows={1} disabled={sending} placeholder="메시지를 입력하세요" className="min-h-11 min-w-0 flex-1 resize-none rounded-[10px] border-0 bg-[#FFF8F3] px-3 py-2 text-base leading-7 outline-none focus:ring-1 focus:ring-boot-primary" /><button type="submit" disabled={sending || !draft.trim() || [...draft].length > 1000} aria-label="메시지 보내기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-boot-primary text-white disabled:opacity-40">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button></div><p className="mt-1 pr-1 text-right text-[11px] text-boot-muted">{[...draft].length}/1000</p></form>}
  </div>
}
