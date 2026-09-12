'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, RefreshCw, Send } from 'lucide-react'
import { activityRoomErrorMessage, getActivityRoomDefinition, parseActivityRoomDetail, parseActivityRoomMessagePage, mergeActivityRoomMessages, type ActivityRoomDetail, type ActivityRoomCursor, type ActivityRoomMessage } from '@/lib/meetups/activity-room-contract'
import { MEETUP_GENDER_LABELS } from '@/lib/community/meetup-gender'
import styles from './activity-rooms.module.css'
import { fetchActivityRoom } from '@/lib/meetups/activity-room-client'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import ChatComposerActions from '@/components/chat-polls/ChatComposerActions'
import ActivityPromptDeck from './ActivityPromptDeck'
import {useSocialChatRead} from '@/lib/chat/useSocialChatRead'

type HistoryState = { messages: ActivityRoomMessage[]; cursor: ActivityRoomCursor | null; hasMore: boolean; expanded: boolean }
const emptyHistory: HistoryState = { messages: [], cursor: null, hasMore: false, expanded: false }

export default function ActivityRoomChat({ roomId, embedded = false, readOnly = false }: { roomId: string; embedded?: boolean; readOnly?: boolean }) {
  const router = useRouter()
  const [room, setRoom] = useState<ActivityRoomDetail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pollComposerRequest, setPollComposerRequest] = useState(0)
  const [history, setHistory] = useState<HistoryState>(emptyHistory)
  const [historyError, setHistoryError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const prependPosition = useRef<{ top: number; height: number } | null>(null)
  const pendingSend = useRef<{ message: string; key: string } | null>(null)
  const mutation = useRef(false)
  const mounted = useRef(true)
  const generation = useRef(0)
  const readInFlight = useRef(false)
  const invalidateRead = useCallback(() => { ++generation.current; readInFlight.current = false }, [])
  const messagesRef = useRef<HTMLDivElement>(null)
  useSocialChatRead('activity_room',roomId,history.messages,{root:messagesRef,enabled:!!room&&!error})
  const nearBottom = useRef(true)
  const endpoint = `/api/meetups/rooms/${roomId}`
  const load = useCallback(async (quiet = false) => {
    if (!mounted.current) return
    if (quiet && readInFlight.current) return
    readInFlight.current = true
    const request = ++generation.current
    try {
      const { ok, payload } = await fetchActivityRoom(endpoint)
      const detail = parseActivityRoomDetail(payload?.data)
      if (!ok || !detail || detail.id !== roomId || !detail.joined) throw new Error(payload?.error ?? 'membership_required')
      if (request === generation.current) {
        setRoom(detail); setError('')
        setHistory(current => {
          // A long offline gap may have more than one page of new messages.
          // Restart that window rather than silently leave a hole between pages.
          const overlaps = detail.messages.some(item => current.messages.some(old => old.id === item.id))
          if (current.expanded && (detail.messages.length < 100 || overlaps)) return { ...current, messages: mergeActivityRoomMessages(current.messages, detail.messages) }
          const first = detail.messages[0]
          return { messages: detail.messages, cursor: first ? { id: first.id, created_at: first.created_at } : null, hasMore: detail.messages.length === 100, expanded: false }
        })
      }
    } catch (failure) {
      if (request === generation.current) { setRoom(null); setHistory(emptyHistory); setError(failure instanceof Error ? failure.message : 'unavailable') }
    } finally { if (request === generation.current) { readInFlight.current = false; setLoading(false) } }
  }, [endpoint, roomId])

  useEffect(() => {
    mounted.current = true
    setRoom(null)
    setHistory(emptyHistory)
    setHistoryError('')
    prependPosition.current = null
    nearBottom.current = true
    setLoading(true)
    void load()
    const refresh = () => { if (!mutation.current && document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => { mounted.current = false; invalidateRead(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load, invalidateRead])
  useLayoutEffect(() => {
    const list = messagesRef.current
    if (!list) return
    if (prependPosition.current) {
      list.scrollTop = prependPosition.current.top + list.scrollHeight - prependPosition.current.height
      prependPosition.current = null
    } else if (nearBottom.current) list.scrollTop = list.scrollHeight
  }, [history.messages])

  const lobbyHref = room ? `/meetups/activities/${room.activity_key}/rooms?gender_mode=${room.gender_mode}` : '/meetups'

  function refreshChat() {
    setHistory(emptyHistory); setHistoryError(''); prependPosition.current = null; nearBottom.current = true
    void load()
  }

  async function loadOlder() {
    if (!room || !history.cursor || !history.hasMore || mutation.current) return
    mutation.current = true; setBusy(true); setLoadingHistory(true); setHistoryError('')
    const request = ++generation.current
    const query = new URLSearchParams({ before_created_at: history.cursor.created_at, before_message_id: history.cursor.id })
    try {
      const { ok, payload } = await fetchActivityRoom(`${endpoint}/messages?${query}`)
      const page = parseActivityRoomMessagePage(payload?.data)
      if (!ok || !page || page.room_id !== roomId) throw new Error(payload?.error ?? 'invalid_response')
      if (request !== generation.current) return
      const list = messagesRef.current
      if (list) prependPosition.current = { top: list.scrollTop, height: list.scrollHeight }
      nearBottom.current = false
      setHistory(current => ({ messages: mergeActivityRoomMessages(page.messages, current.messages), cursor: page.next_cursor, hasMore: page.has_more, expanded: true }))
    } catch (failure) {
      if (request !== generation.current) return
      const code = failure instanceof Error ? failure.message : 'unavailable'
      setHistoryError(activityRoomErrorMessage(code))
      if (/Unauthorized|not_authenticated|membership_required|blocked|forbidden|not_found|account_deletion|profile_required|gender/.test(code)) {
        setRoom(null); setHistory(emptyHistory); setError(code)
      }
    } finally {
      mutation.current = false; readInFlight.current = false; setBusy(false); setLoadingHistory(false)
    }
  }

  async function send() {
    const text = message.trim()
    if (!room || !text || mutation.current || text.length > 1000 || error || readOnly) return
    mutation.current = true; setBusy(true); ++generation.current
    if (pendingSend.current?.message !== text) pendingSend.current = { message: text, key: crypto.randomUUID() }
    try {
      const { ok, payload } = await fetchActivityRoom(`${endpoint}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, idempotency_key: pendingSend.current.key }) })
      if (!ok) throw new Error(payload?.error ?? 'unavailable')
      pendingSend.current = null; setMessage(''); nearBottom.current = true
      await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'unavailable') }
    finally { mutation.current = false; setBusy(false) }
  }

  async function leave() {
    if (mutation.current || !window.confirm('이 방에서 나갈까요? 나가면 이 방의 채팅을 볼 수 없어요.')) return
    mutation.current = true; setBusy(true); ++generation.current
    try {
      const { ok, payload } = await fetchActivityRoom(`${endpoint}/join`, { method: 'DELETE' })
      if (!mounted.current) return
      if (!ok) throw new Error(payload?.error ?? 'unavailable')
      router.replace(embedded ? '/chat' : lobbyHref)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'unavailable') }
    finally { mutation.current = false; setBusy(false) }
  }

  const Container = embedded ? 'section' : 'main'
  return <Container className={embedded ? undefined : styles.page}><div className={styles.shell}>
    {!embedded ? <Link href={lobbyHref} className={styles.back}><ArrowLeft size={18} />모임방 목록</Link> : null}
    {loading ? <div className={styles.status} role="status">내 방을 확인하고 있어요.</div> : null}
    {error ? <div className={styles.error} role="alert"><strong>방 연결을 확인해 주세요</strong><p>{activityRoomErrorMessage(error)}</p><button className={styles.secondary} disabled={busy} onClick={() => void load()}>다시 연결</button>{error === 'Unauthorized' ? <Link className={styles.back} href={`/login?redirect=${encodeURIComponent('/meetups/rooms/' + roomId)}`}>로그인하기</Link> : <button className={styles.leave} disabled={busy} onClick={() => void leave()}>채팅을 열지 않고 이 방에서 나가기</button>}</div> : null}
    {room ? <>
      {!embedded ? <header className={styles.chatHeader}><p className={styles.eyebrow}>{MEETUP_GENDER_LABELS[room.gender_mode]} · {room.room_number}번 방</p><h1>{getActivityRoomDefinition(room.activity_key)?.title}</h1><p>{room.member_count}/{room.capacity}명 · {room.members.map(member => `${member.alias}${member.is_me ? ' (나)' : ''}`).join(' · ')}</p></header> : null}
      <div className={styles.chatActions}><span className={styles.eyebrow}>오늘의 별명으로 대화해요</span><button className={styles.iconButton} onClick={refreshChat} disabled={busy} aria-label="채팅 새로고침"><RefreshCw size={17} /></button></div>
      {history.hasMore ? <button className={styles.secondary} onClick={() => void loadOlder()} disabled={busy}>{loadingHistory ? '이전 대화 불러오는 중…' : '이전 대화 불러오기'}</button> : history.expanded ? <p className={styles.eyebrow}>이 방의 첫 대화까지 확인했어요.</p> : null}
      {historyError ? <p className={styles.historyError} role="alert">{historyError}</p> : null}
      <div className={styles.messages} ref={messagesRef} role="log" aria-label="모임방 대화" aria-live="polite" tabIndex={0} onScroll={() => { const list = messagesRef.current; if (list) nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80 }}>
        {history.messages.length === 0 ? <div className={styles.status}>첫 인사를 건네 볼까요?<br />“안녕하세요! 몇 시가 편하세요?”</div> : history.messages.map(item => <article className={`${styles.message} ${item.is_me ? styles.messageMine : ''}`} key={item.id} data-social-message-id={item.id}><p className={styles.sender}>{item.is_me ? '나' : item.sender_alias}</p><p className={styles.bubble}>{item.message}</p><time className={styles.time} dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></article>)}
      </div>
      {!readOnly ? <ActivityRoomPolls roomId={roomId} composerRequest={pollComposerRequest} /> : null}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send() }}><ChatComposerActions onCreatePoll={() => setPollComposerRequest(value => value + 1)} disabled={busy || readOnly} /><textarea aria-label="메시지 입력" placeholder="같이할 친구들에게 한마디" rows={1} value={message} maxLength={1000} disabled={busy || readOnly} onChange={event => { setMessage(event.target.value); if (pendingSend.current?.message !== event.target.value.trim()) pendingSend.current = null }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} /><button type="submit" aria-label="메시지 보내기" disabled={busy || readOnly || !message.trim() || !!error}><Send size={20} /></button></form>
      <details className={styles.chatGuide}><summary><MessageCircle size={17} />약속과 모임 안내</summary><div className={styles.chatGuideBody}><aside className={styles.hint}><MessageCircle size={18} /><div><strong>먼저 이전 대화에서 약속을 확인해요</strong><p>새로 들어와도 입장 전 대화를 볼 수 있어요. 이미 정한 시간·장소를 읽고 인사해 주세요. 아직 정하지 않았다면 함께 조율해요.</p></div></aside><ActivityPromptDeck activityKey={room.activity_key} category={getActivityRoomDefinition(room.activity_key)?.category ?? 'other'} /></div></details>
      <button className={styles.leave} onClick={() => void leave()} disabled={busy}>이 방 나가기</button>
    </> : null}
  </div></Container>
}
