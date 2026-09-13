'use client'

import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {RefreshCw} from 'lucide-react'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import SocialMessenger, {SocialChatComposer} from '@/components/chat/SocialMessenger'
import {PendingChatSends,clearSentDraft} from '@/lib/chat/social-messenger-state'
import {createChatPollOfflineTransport} from '@/lib/chat-polls/offline-fixture'
import {parseLeagueChatState,parseLeagueChatMessage,type LeagueChatMessage as Message,type LeagueChatState as Page} from '@/lib/meetups/league-lobby'
import s from './league-match-chat.module.css'
import {useSocialChatRead} from '@/lib/chat/useSocialChatRead'

const merge=(first:Message[],second:Message[])=>Array.from(new Map([...first,...second].map(m=>[m.id,m])).values()).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))

export default function LeagueMatchChat({challengeId,demo,schedule,scheduled,onRefresh,teamNames=[]}:{teamNames?:string[];challengeId:string;demo:boolean;schedule:ReactNode;scheduled?:boolean;onRefresh:()=>Promise<unknown>}){
 const [page,setPage]=useState<Page|null>(demo?{challenge_id:challengeId,messages:[],has_more:false,next_cursor:null,writable:true}:null),[error,setError]=useState(''),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[pollRequest,setPollRequest]=useState(0)
 const [fixture]=useState(()=>demo?createChatPollOfflineTransport({empty:true}):null)
 const [loading,setLoading]=useState(!demo)
 const generation=useRef(0),mutation=useRef(false),pending=useRef(new PendingChatSends()),log=useRef<HTMLDivElement>(null),history=useRef(false)
 const currentScope=useRef(challengeId),alive=useRef(true),lifecycle=useRef(0),readController=useRef<AbortController|null>(null),sendController=useRef<AbortController|null>(null)
 currentScope.current=challengeId
 const invalidateLoad=useCallback(()=>{++generation.current;readController.current?.abort()},[])
 useSocialChatRead('league_match',challengeId,page?.messages??[],{root:log,enabled:!demo&&!!page&&!error})
 const load=useCallback(async(before?:string)=>{
  if(demo)return
  const version=++generation.current;readController.current?.abort();const controller=new AbortController();readController.current=controller;setLoading(true)
  const timeout=window.setTimeout(()=>controller.abort(),12000)
  try{const query=new URLSearchParams({challenge_id:challengeId,...(before?{before}:{})}),response=await fetch(`/api/community/department/league/lobby/chat?${query}`,{cache:'no-store',signal:controller.signal}),payload=await response.json().catch(()=>null),parsed=parseLeagueChatState(payload?.chat);if(!response.ok||!parsed||parsed.challenge_id!==challengeId)throw new Error('chat_unavailable');if(!alive.current||version!==generation.current||currentScope.current!==challengeId)return
   setPage(previous=>{if(!previous)return parsed;if(before){history.current=true;return{...parsed,messages:merge(parsed.messages,previous.messages)}}const overlap=parsed.messages.some(m=>previous.messages.some(old=>old.id===m.id));return history.current&&overlap?{...previous,writable:parsed.writable,messages:merge(previous.messages,parsed.messages)}:parsed});setError('')
  }catch{if(alive.current&&version===generation.current&&currentScope.current===challengeId){setPage(null);setError('경기 채팅 연결을 확인해 주세요. 다시 연결한 뒤 전송할 수 있어요.')}}
  finally{window.clearTimeout(timeout);if(alive.current&&version===generation.current&&currentScope.current===challengeId)setLoading(false)}
 },[challengeId,demo])
 useEffect(()=>{alive.current=true;void load();const timer=window.setInterval(()=>{if(!mutation.current&&document.visibilityState==='visible'){void load();void onRefresh()}},8000);return()=>{invalidateLoad();window.clearInterval(timer)}},[load,onRefresh,invalidateLoad])
 useEffect(()=>{alive.current=true;history.current=false;pending.current.clear();setBody('');setError('');mutation.current=false;setBusy(false);return()=>{alive.current=false;++lifecycle.current;invalidateLoad();sendController.current?.abort()}},[challengeId,invalidateLoad])
 async function send(){
  const text=body.trim();if(!text||text.length>1000||mutation.current||!page?.writable||error)return
  if(demo){setPage(current=>current?{...current,messages:[...current.messages,{id:crypto.randomUUID(),body:text,alias:'나',is_me:true,created_at:new Date().toISOString()}]}:current);setBody(current=>clearSentDraft(current,text));return}
  mutation.current=true;setBusy(true);invalidateLoad();setLoading(false)
  const key=pending.current.key(text,()=>crypto.randomUUID()),ticket=lifecycle.current,controller=new AbortController();sendController.current=controller
  const timeout=window.setTimeout(()=>controller.abort(),12000),current=()=>alive.current&&ticket===lifecycle.current&&currentScope.current===challengeId
  try{const response=await fetch('/api/community/department/league/lobby/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge_id:challengeId,body:text,idempotency_key:key}),signal:controller.signal}),payload=await response.json().catch(()=>null),message=parseLeagueChatMessage(payload?.message);if(!response.ok||!message||!message.is_me||message.body!==text)throw new Error('send_failed');if(!current())return;pending.current.acknowledge(text);setBody(draft=>clearSentDraft(draft,text));setPage(previous=>previous?{...previous,messages:merge(previous.messages,[message])}:previous);setError('')}
  catch{if(current()){setPage(null);setError('전송 결과를 확인하지 못했어요. 다시 연결하면 작성한 내용으로 재시도할 수 있어요.')}}
  finally{window.clearTimeout(timeout);if(current()){mutation.current=false;setBusy(false)}}
 }
 return <section className={`${s.chat} ${s.viewport}`} aria-label="양 팀 경기 채팅" data-league-match-chat={demo?'rehearsal':'live'}>
  <SocialMessenger header={teamNames.length?{kind:'league_match',title:teamNames.join(' vs '),affiliation:'상대 팀과 함께하는 경기방'}:undefined} scope={challengeId} root={log} messages={page?.messages.map(message=>({id:message.id,alias:message.alias,text:message.body,createdAt:message.created_at,isMe:message.is_me}))??[]}
   loading={loading} error={error} onRetry={()=>void load()} readOnly={!!page&&!page.writable}
   management={<><button type="button" className={s.older} aria-label="경기 채팅 새로고침" disabled={busy||loading} onClick={()=>{void load();void onRefresh()}}><RefreshCw size={16}/>경기 채팅 새로고침</button><p className={s.caption}>채팅으로 날짜와 장소를 상의해요. 약속은 양 팀 주장이 같은 내용을 확인해야 확정돼요.</p><div className={s.scheduleBody}><h3>{scheduled===undefined?'경기 지도에서 약속 확인':scheduled?'확정된 경기 약속':'날짜·장소 아직 미정'}</h3>{schedule}</div></>}
   tools={page?<ActivityRoomPolls roomId={fixture?.roomId??challengeId} roomKind="department-challenges" transport={fixture?.transport} composerRequest={pollRequest} readOnly={!page.writable}/>:null}
   beforeMessages={page?.has_more&&page.next_cursor?<button type="button" className={s.older} disabled={busy||loading} onClick={()=>void load(page.next_cursor!)}>이전 대화 보기</button>:null}
   notice={demo?<button type="button" className={s.older} onClick={()=>setPage(current=>current?{...current,messages:[...current.messages,{id:crypto.randomUUID(),alias:'예시 상대 주장',body:'안녕하세요! 금요일 저녁은 어떠세요? 장소도 같이 정해요.',is_me:false,created_at:new Date().toISOString()}]}:current)}>예시 상대 주장: 인사 메시지 넣기</button>:null}
   empty="서로 인사하며 경기 약속을 잡아요"
   composer={<SocialChatComposer value={body} onChange={setBody} onSend={()=>void send()} busy={busy} disabled={!page?.writable||!!error} onCreatePoll={()=>setPollRequest(value=>value+1)} label="경기 메시지 입력" placeholder="날짜와 장소를 함께 정해요"/>}/>
 </section>
}
