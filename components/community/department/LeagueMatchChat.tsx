'use client'

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react'
import {Send,RefreshCw} from 'lucide-react'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import ChatComposerActions from '@/components/chat-polls/ChatComposerActions'
import {createChatPollOfflineTransport} from '@/lib/chat-polls/offline-fixture'
import {parseLeagueChatState,parseLeagueChatMessage,type LeagueChatMessage as Message,type LeagueChatState as Page} from '@/lib/meetups/league-lobby'
import s from './league-match-chat.module.css'
import {useSocialChatRead} from '@/lib/chat/useSocialChatRead'

const merge=(first:Message[],second:Message[])=>Array.from(new Map([...first,...second].map(m=>[m.id,m])).values()).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))

export default function LeagueMatchChat({challengeId,demo,schedule,scheduled,onRefresh,teamNames=[]}:{teamNames?:string[];challengeId:string;demo:boolean;schedule:ReactNode;scheduled?:boolean;onRefresh:()=>Promise<unknown>}){
 const [page,setPage]=useState<Page|null>(demo?{challenge_id:challengeId,messages:[],has_more:false,next_cursor:null,writable:true}:null),[error,setError]=useState(''),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[pollRequest,setPollRequest]=useState(0)
 const [fixture]=useState(()=>demo?createChatPollOfflineTransport({empty:true}):null)
 const generation=useRef(0),mutation=useRef(false),pending=useRef<{body:string;key:string}|null>(null),log=useRef<HTMLDivElement>(null),nearBottom=useRef(true),history=useRef(false)
 const invalidateLoad=useCallback(()=>{++generation.current},[])
 useSocialChatRead('league_match',challengeId,page?.messages??[],{root:log,enabled:!demo&&!!page&&!error})
 const load=useCallback(async(before?:string)=>{
  if(demo)return
  const version=++generation.current
  try{const query=new URLSearchParams({challenge_id:challengeId,...(before?{before}:{})}),response=await fetch(`/api/community/department/league/lobby/chat?${query}`,{cache:'no-store'}),payload=await response.json().catch(()=>null),parsed=parseLeagueChatState(payload?.chat);if(!response.ok||!parsed||parsed.challenge_id!==challengeId)throw new Error('chat_unavailable');if(version!==generation.current)return
   setPage(previous=>{if(!previous)return parsed;if(before){history.current=true;return{...parsed,messages:merge(parsed.messages,previous.messages)}}const overlap=parsed.messages.some(m=>previous.messages.some(old=>old.id===m.id));return history.current&&overlap?{...previous,writable:parsed.writable,messages:merge(previous.messages,parsed.messages)}:parsed});setError('')
  }catch{if(version===generation.current){setPage(null);setError('경기 채팅 연결을 확인해 주세요. 다시 연결한 뒤 전송할 수 있어요.')}}
 },[challengeId,demo])
 useEffect(()=>{void load();const timer=window.setInterval(()=>{if(!mutation.current&&document.visibilityState==='visible'){void load();void onRefresh()}},8000);return()=>{invalidateLoad();window.clearInterval(timer)}},[load,onRefresh,invalidateLoad])
 useLayoutEffect(()=>{if(log.current&&nearBottom.current)log.current.scrollTop=log.current.scrollHeight},[page?.messages.length])
 async function send(){
  const text=body.trim();if(!text||text.length>1000||mutation.current||!page?.writable||error)return
  if(demo){setPage(current=>current?{...current,messages:[...current.messages,{id:crypto.randomUUID(),body:text,alias:'나',is_me:true,created_at:new Date().toISOString()}]}:current);setBody('');nearBottom.current=true;return}
  mutation.current=true;setBusy(true);++generation.current
  if(pending.current?.body!==text)pending.current={body:text,key:crypto.randomUUID()}
  try{const response=await fetch('/api/community/department/league/lobby/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge_id:challengeId,body:text,idempotency_key:pending.current.key})}),payload=await response.json().catch(()=>null);if(!response.ok||!parseLeagueChatMessage(payload?.message))throw new Error('send_failed');pending.current=null;setBody('');nearBottom.current=true;await load()}
  catch{setPage(null);setError('전송 결과를 확인하지 못했어요. 다시 연결하면 작성한 내용으로 재시도할 수 있어요.')}
  finally{mutation.current=false;setBusy(false)}
 }
 return <section className={s.chat} aria-label="양 팀 경기 채팅" data-league-match-chat={demo?'rehearsal':'live'}>
  <header className={s.header}><div><span>{teamNames.length?teamNames.join(' vs '):'양 팀 참가자만 함께하는'}</span><h2>경기 채팅</h2></div><button type="button" aria-label="경기 채팅 새로고침" disabled={busy} onClick={()=>{void load();void onRefresh()}}><RefreshCw size={18}/></button></header>
  <details className={s.schedule}><summary><span>{scheduled===undefined?'경기 지도에서 약속 확인':scheduled?'확정된 경기 약속':'날짜·장소 아직 미정'}</span><b>약속 {scheduled===undefined||scheduled?'보기':'제안·확인'} ＋</b></summary><div className={s.scheduleBody}>{schedule}</div></details>
  <p className={s.caption}>채팅으로 날짜와 장소를 상의해요. 약속은 양 팀 주장이 같은 내용을 확인해야 확정돼요.</p>
  {error?<div className={s.error} role="alert">{error}<button type="button" disabled={busy} onClick={()=>void load()}>다시 연결</button></div>:null}
  {page?<>
   {page.has_more&&page.next_cursor?<button type="button" className={s.older} disabled={busy} onClick={()=>{nearBottom.current=false;void load(page.next_cursor!)}}>이전 대화 보기</button>:null}
   <div className={s.messages} ref={log} role="log" aria-label="경기 대화" aria-live="polite" tabIndex={0} onScroll={()=>{const element=log.current;if(element)nearBottom.current=element.scrollHeight-element.scrollTop-element.clientHeight<80}}>{page.messages.length?page.messages.map(message=><article key={message.id} data-social-message-id={message.id} className={message.is_me?s.mine:s.message}><small>{message.is_me?'나':message.alias}</small><p>{message.body}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time></article>):<div className={s.empty}><strong>서로 인사하며 경기 약속을 잡아요</strong><p>“안녕하세요! 이번 주 언제가 편하세요?”</p></div>}</div>
   <ActivityRoomPolls roomId={fixture?.roomId??challengeId} roomKind="department-challenges" transport={fixture?.transport} composerRequest={pollRequest}/>
   <form className={s.composer} onSubmit={event=>{event.preventDefault();void send()}}><ChatComposerActions disabled={busy||!page.writable} onCreatePoll={()=>setPollRequest(value=>value+1)}/><textarea aria-label="경기 메시지 입력" rows={1} maxLength={1000} value={body} disabled={busy||!page.writable} onChange={event=>setBody(event.target.value)} placeholder="날짜와 장소를 함께 정해요" onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send()}}}/><button type="submit" aria-label="경기 메시지 보내기" disabled={busy||!page.writable||!body.trim()}><Send size={19}/></button></form>
   {!page.writable?<p className={s.caption}>이 경기는 읽기만 가능해요.</p>:null}
   {demo?<button type="button" className={s.older} onClick={()=>setPage(current=>current?{...current,messages:[...current.messages,{id:crypto.randomUUID(),alias:'예시 상대 주장',body:'안녕하세요! 금요일 저녁은 어떠세요? 장소도 같이 정해요.',is_me:false,created_at:new Date().toISOString()}]}:current)}>예시 상대 주장: 인사 메시지 넣기</button>:null}
  </>:!error?<p className={s.caption} role="status">수락한 참가자의 경기 채팅을 확인하고 있어요.</p>:null}
 </section>
}
