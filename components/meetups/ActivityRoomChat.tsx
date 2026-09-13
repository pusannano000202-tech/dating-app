'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, RefreshCw } from 'lucide-react'
import { activityRoomErrorMessage, getActivityRoomDefinition, parseActivityRoomDetail, parseActivityRoomMessagePage, mergeActivityRoomMessages, type ActivityRoomDetail, type ActivityRoomCursor, type ActivityRoomMessage } from '@/lib/meetups/activity-room-contract'
import { MEETUP_GENDER_LABELS } from '@/lib/community/meetup-gender'
import styles from './activity-rooms.module.css'
import { fetchActivityRoom } from '@/lib/meetups/activity-room-client'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import SocialMessenger,{SocialChatComposer} from '@/components/chat/SocialMessenger'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {clearSentDraft,PendingChatSends,isMeetupSendAcknowledged} from '@/lib/chat/social-messenger-state'
import chatStyles from '@/components/chat/chat-belonging.module.css'
import ActivityPromptDeck from './ActivityPromptDeck'
import {useSocialChatRead} from '@/lib/chat/useSocialChatRead'
import {getSocialActivityPresentation} from '@/lib/social/activity-presentation'

type HistoryState = { messages: ActivityRoomMessage[]; cursor: ActivityRoomCursor | null; hasMore: boolean; expanded: boolean }
const emptyHistory: HistoryState = { messages: [], cursor: null, hasMore: false, expanded: false }

export default function ActivityRoomChat(props: { roomId: string; embedded?: boolean; readOnly?: boolean }) {
  const account=useHistoryAccount()
  if(!account||account==='unavailable')return <section className={styles.status} role="status"><Link href="/chat">채팅 목록</Link><p>{account===undefined?'로그인 정보를 확인하고 있어요.':account==='unavailable'?'로그인 정보를 확인하지 못했어요.':'로그인이 필요해요.'}</p>{account===null?<Link href={`/login?redirect=${encodeURIComponent(`/chat/rooms/activity_room/${props.roomId}`)}`}>로그인하기</Link>:account==='unavailable'?<button type="button" onClick={()=>window.location.reload()}>다시 연결</button>:null}</section>
  return <ActivityRoomChatSession key={`${account}:${props.roomId}`} {...props}/>
}

function ActivityRoomChatSession({ roomId, embedded = false, readOnly = false }: { roomId: string; embedded?: boolean; readOnly?: boolean }) {
  const router = useRouter()
  const [room, setRoom] = useState<ActivityRoomDetail | null>(null)
  const [error, setError] = useState('')
  const [sendError,setSendError]=useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pollComposerRequest, setPollComposerRequest] = useState(0)
  const [history, setHistory] = useState<HistoryState>(emptyHistory)
  const [historyError, setHistoryError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const pendingSends = useRef(new PendingChatSends())
  const mutation = useRef(false)
  const mounted = useRef(true)
  const generation = useRef(0)
  const readInFlight = useRef(false)
  const invalidateRead = useCallback(() => { ++generation.current; readInFlight.current = false }, [])
  const messagesRef = useRef<HTMLDivElement>(null)
  useSocialChatRead('activity_room',roomId,history.messages,{root:messagesRef,enabled:!!room&&!error})
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
    pendingSends.current.clear()
    setLoading(true)
    void load()
    const refresh = () => { if (!mutation.current && document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => { mounted.current = false; invalidateRead(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load, invalidateRead])
  const lobbyHref = room ? `/meetups/activities/${room.activity_key}/rooms?gender_mode=${room.gender_mode}` : '/meetups'

  function refreshChat() {
    setHistory(emptyHistory); setHistoryError(''); setSendError('')
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
    mutation.current = true; setBusy(true); const request=++generation.current
    const key=pendingSends.current.key(text,()=>crypto.randomUUID())
    try {
      const { ok, payload } = await fetchActivityRoom(`${endpoint}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, idempotency_key:key }) })
      if(!mounted.current||request!==generation.current)return
      if (!ok||!isMeetupSendAcknowledged({message:payload?.data},text)) throw new Error(payload?.error ?? 'invalid_response')
      pendingSends.current.acknowledge(text); setMessage(current=>clearSentDraft(current,text));setSendError('')
      await load()
    } catch (failure) { if(mounted.current&&request===generation.current)setSendError(failure instanceof Error ? failure.message : 'unavailable') }
    finally { if(mounted.current){mutation.current = false; setBusy(false)} }
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

  const messenger=<SocialMessenger scope={roomId} root={messagesRef}
    header={!embedded?{kind:'activity_room',title:room?`${getActivityRoomDefinition(room.activity_key)?.title??'활동 모임'} ${room.room_number}번 방`:'활동 모임',categoryLabel:room?getSocialActivityPresentation({kind:'activity_room',activity_key:room.activity_key}).categoryLabel:undefined,memberCount:room?.member_count,affiliation:room?MEETUP_GENDER_LABELS[room.gender_mode]:undefined,backHref:'/chat',detailHref:room?lobbyHref:null,detailLabel:'같은 활동 모집방 보기'}:undefined}
    messages={history.messages.map(item=>({id:item.id,alias:item.sender_alias,text:item.message,createdAt:item.created_at,isMe:item.is_me}))}
    loading={loading} readOnly={readOnly} error={error?activityRoomErrorMessage(error):sendError?`${activityRoomErrorMessage(sendError)} 작성한 내용은 남아 있어요. 다시 보내면 같은 내용은 중복 저장되지 않아요.`:undefined} onRetry={refreshChat}
    beforeMessages={<>{history.hasMore?<button className={styles.secondary} type="button" onClick={()=>void loadOlder()} disabled={busy}>{loadingHistory?'이전 대화 불러오는 중…':'이전 대화 불러오기'}</button>:history.expanded?<p className={styles.eyebrow}>이 방의 첫 대화까지 확인했어요.</p>:null}{historyError?<p className={styles.historyError} role="alert">{historyError}</p>:null}</>}
    tools={room?<ActivityRoomPolls roomId={roomId} composerRequest={pollComposerRequest} readOnly={readOnly||!!error}/>:null}
    management={<>{room?<><p className={styles.eyebrow}>오늘의 별명으로 대화해요</p><h3>참가자 {room.member_count}/{room.capacity}명</h3><p className={styles.hint}>{room.members.map(member=>`${member.alias}${member.is_me?' (나)':''}`).join(' · ')}</p><button type="button" className={styles.secondary} onClick={refreshChat} disabled={busy}><RefreshCw size={17}/>채팅 새로고침</button><details className={styles.chatGuide}><summary><MessageCircle size={17}/>약속과 모임 안내</summary><div className={styles.chatGuideBody}><aside className={styles.hint}><div><strong>먼저 이전 대화에서 약속을 확인해요</strong><p>새로 들어와도 입장 전 대화를 볼 수 있어요. 이미 정한 시간·장소를 읽고 인사해 주세요. 아직 정하지 않았다면 함께 조율해요.</p></div></aside><ActivityPromptDeck activityKey={room.activity_key} category={getActivityRoomDefinition(room.activity_key)?.category??'other'}/></div></details></>:null}{error==='Unauthorized'?<Link href={`/login?redirect=${encodeURIComponent('/chat/rooms/activity_room/'+roomId)}`}>로그인하기</Link>:<button className={styles.leave} type="button" onClick={()=>void leave()} disabled={busy}>이 방 나가기</button>}</>}
    composer={<SocialChatComposer value={message} onChange={setMessage} onSend={()=>void send()} busy={busy} disabled={!room||readOnly||!!error} onCreatePoll={()=>setPollComposerRequest(value=>value+1)} placeholder="같이할 친구들에게 한마디"/>}/>
  return embedded?messenger:<main className={`${chatStyles.roomShell} ${chatStyles.roomViewport}`}>{messenger}</main>
}
