'use client'

import Link from 'next/link'
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type FormEvent} from 'react'
import {ArrowLeft,MapPinned,MessageCircle,RefreshCw,Send,ShieldCheck} from 'lucide-react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {LEAGUE_SPORTS} from '@/lib/meetups/challenge-journey'
import {parseLeagueTeamChatResponse,parseLeagueTeamMessageResponse,type LeagueTeamChat as Chat,type LeagueTeamChatMessage as Message} from '@/lib/chat/league-team-contract'
import s from './league-team-chat.module.css'
import {useSocialChatRead} from '@/lib/chat/useSocialChatRead'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import ChatComposerActions from '@/components/chat-polls/ChatComposerActions'
import {createChatPollOfflineTransport} from '@/lib/chat-polls/offline-fixture'

export type LeagueTeamChatTransport={
 read:(before:string|undefined,signal:AbortSignal)=>Promise<unknown>
 send:(body:string,key:string,signal:AbortSignal)=>Promise<unknown>
}
export type LeagueTeamChatDemo={ownerId:string;transport:LeagueTeamChatTransport;onBack:()=>void;onMap:()=>void}
type DemoMessage=Message&{sender_id:string}
export type LeagueTeamChatDemoStore=Map<string,{messages:DemoMessage[];keys:Map<string,DemoMessage>}>
export function createLeagueTeamChatDemoTransport(store:LeagueTeamChatDemoStore,ownerId:string,chat:Omit<Chat,'messages'|'has_more'|'next_cursor'>,alias:string,allowed:boolean):LeagueTeamChatTransport{
 const state=store.get(chat.team_id)??{messages:[],keys:new Map<string,DemoMessage>()};store.set(chat.team_id,state)
 const ensure=()=>{if(!allowed)throw new Error('team_membership_required')}
 const present=({sender_id,...message}:DemoMessage):Message=>({...message,is_me:sender_id===ownerId})
 return{
  async read(before){ensure();const end=before?state.messages.findIndex(message=>message.id===before):state.messages.length;if(end<0)throw new Error('invalid_cursor');const start=Math.max(0,end-50),messages=state.messages.slice(start,end).map(present);return{owner_id:ownerId,chat:{...chat,messages,has_more:start>0,next_cursor:start>0?messages[0].id:null}}},
  async send(body,key){ensure();const token=`${ownerId}:${key}`,previous=state.keys.get(token);if(previous&&previous.body!==body)throw new Error('idempotency_conflict');if(previous)return{owner_id:ownerId,message:present(previous)};const message:DemoMessage={id:crypto.randomUUID(),body,alias,is_me:true,sender_id:ownerId,created_at:new Date().toISOString()};state.messages.push(message);state.keys.set(token,message);return{owner_id:ownerId,message:present(message)}}
 }
}

export function mergeLeagueTeamMessages(first:Message[],second:Message[]):Message[]{return Array.from(new Map([...first,...second].map(message=>[message.id,message])).values()).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))}
export function mergeLeagueTeamPage(previous:Chat|null,incoming:Chat,before?:string):Chat{
 if(!previous||previous.team_id!==incoming.team_id)return incoming
 if(before)return{...incoming,messages:mergeLeagueTeamMessages(incoming.messages,previous.messages)}
 if(!incoming.has_more||!incoming.messages.some(message=>previous.messages.some(known=>known.id===message.id)))return incoming
 // A polling page is the newest slice. Keep the oldest loaded cursor and its history.
 return{...incoming,messages:mergeLeagueTeamMessages(previous.messages,incoming.messages),has_more:previous.has_more,next_cursor:previous.next_cursor}
}
async function responseJson(response:Response){const payload=await response.json().catch(()=>null);if(!response.ok)throw new Error(typeof payload?.error==='string'?payload.error:'chat_unavailable');return payload}
function LiveLeagueTeamChat({teamId}:{teamId:string}){
 const account=useHistoryAccount()
 const transport=useMemo<LeagueTeamChatTransport>(()=>({
  read:(before,signal)=>fetch(`/api/chat/league-team?${new URLSearchParams({team_id:teamId,...(before?{before}:{})})}`,{cache:'no-store',signal}).then(responseJson),
  send:(body,key,signal)=>fetch('/api/chat/league-team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({team_id:teamId,body,idempotency_key:key}),signal}).then(responseJson)
 }),[teamId])
 if(!account||account==='unavailable')return <main className={s.page}><div className={s.shell}><Link className={s.back} href="/chat"><ArrowLeft size={19}/>채팅 목록</Link><section className={s.state} role="status"><h1>우리 팀 채팅</h1><p>{account===undefined?'로그인 정보를 확인하고 있어요.':account==='unavailable'?'로그인 정보를 확인하지 못했어요. 다시 연결해 주세요.':'로그인하면 내가 참가한 팀의 대화를 볼 수 있어요.'}</p>{account===null?<Link href="/login">로그인하기</Link>:account==='unavailable'?<button type="button" onClick={()=>window.location.reload()}>다시 연결</button>:null}</section></div></main>
 return <LeagueTeamChatSession key={`${account}:${teamId}`} teamId={teamId} ownerId={account} transport={transport}/>
}

export default function LeagueTeamChat({teamId,demo}:{teamId:string;demo?:LeagueTeamChatDemo}){
 return demo?<LeagueTeamChatSession key={`${demo.ownerId}:${teamId}`} teamId={teamId} ownerId={demo.ownerId} transport={demo.transport} demo={demo}/>:<LiveLeagueTeamChat teamId={teamId}/>
}

function LeagueTeamChatSession({teamId,ownerId,transport,demo}:{teamId:string;ownerId:string;transport:LeagueTeamChatTransport;demo?:LeagueTeamChatDemo}){
 const [pollRequest,setPollRequest]=useState(0)
 const [pollFixture]=useState(()=>demo?createChatPollOfflineTransport({empty:true}):null)
 const [page,setPage]=useState<Chat|null>(null),[body,setBody]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const generation=useRef(0),scope=useRef(0),alive=useRef(true),reading=useRef(false),mutation=useRef(false),readController=useRef<AbortController|null>(null),sendController=useRef<AbortController|null>(null)
 const pendingKeys=useRef(new Map<string,string>()),log=useRef<HTMLDivElement>(null),nearBottom=useRef(true),scrollRestore=useRef<{height:number;top:number}|null>(null)
 useSocialChatRead('league_team',teamId,page?.messages??[],{root:log,enabled:!demo&&!!page&&!error,ownerId})
 const invalidate=useCallback(()=>{alive.current=false;++scope.current;++generation.current;readController.current?.abort();sendController.current?.abort()},[])
 const load=useCallback(async(before?:string)=>{
  if(mutation.current)return
  const version=++generation.current;readController.current?.abort();const controller=new AbortController();readController.current=controller;reading.current=true;setLoading(true)
  const timeout=window.setTimeout(()=>controller.abort(),12000)
  try{
   const parsed=parseLeagueTeamChatResponse(await transport.read(before,controller.signal),ownerId,teamId)
   if(!parsed)throw new Error('invalid_chat_response')
   if(!alive.current||version!==generation.current)return
   if(before&&log.current)scrollRestore.current={height:log.current.scrollHeight,top:log.current.scrollTop}
   setPage(previous=>mergeLeagueTeamPage(previous,parsed.chat,before));setError('')
  }catch{if(alive.current&&version===generation.current){setPage(null);setError('팀 채팅을 확인하지 못했어요. 다시 연결하면 작성한 내용으로 이어갈 수 있어요.')}}
  finally{window.clearTimeout(timeout);if(alive.current&&version===generation.current){reading.current=false;setLoading(false)}}
 },[ownerId,teamId,transport])
 useEffect(()=>{
  alive.current=true;mutation.current=false;setBusy(false);void load()
  const refresh=()=>{if(!reading.current&&!mutation.current&&document.visibilityState==='visible')void load()}
  const timer=window.setInterval(refresh,8000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  return()=>{invalidate();window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
 },[load,invalidate])
 useLayoutEffect(()=>{if(!log.current)return;if(scrollRestore.current){log.current.scrollTop=scrollRestore.current.top+log.current.scrollHeight-scrollRestore.current.height;scrollRestore.current=null}else if(nearBottom.current)log.current.scrollTop=log.current.scrollHeight},[page?.messages])
 async function send(event:FormEvent){
  event.preventDefault();const draft=body,text=draft.trim()
  if(!text||text.length>1000||mutation.current||!page?.writable||error)return
  mutation.current=true;setBusy(true);++generation.current;readController.current?.abort();reading.current=false;setLoading(false)
  const key=pendingKeys.current.get(text)??crypto.randomUUID();pendingKeys.current.set(text,key)
  const lifecycle=scope.current,controller=new AbortController();sendController.current=controller;const timeout=window.setTimeout(()=>controller.abort(),12000)
  try{
   const parsed=parseLeagueTeamMessageResponse(await transport.send(text,key,controller.signal),ownerId)
   if(!parsed||!parsed.message.is_me||parsed.message.body!==text)throw new Error('invalid_message_response')
   if(!alive.current||lifecycle!==scope.current)return
   pendingKeys.current.delete(text);setBody(current=>current===draft?'':current);nearBottom.current=true
   setPage(current=>current?{...current,messages:mergeLeagueTeamMessages(current.messages,[parsed.message])}:current);setError('')
  }catch{if(alive.current&&lifecycle===scope.current){setPage(null);setError('전송 결과를 확인하지 못했어요. 다시 연결한 뒤 전송하면 같은 내용은 중복 저장되지 않아요.')}}
  finally{window.clearTimeout(timeout);if(alive.current&&lifecycle===scope.current){mutation.current=false;setBusy(false)}}
 }
 const mapHref=page?`/community/department?${new URLSearchParams({sport:page.sport,challenge:page.challenge_id,team:page.team_id})}`:null
 return <main className={s.page} data-league-team-chat={demo?'rehearsal':'live'}><div className={s.shell}>
  <nav className={s.navigation} aria-label="팀 채팅 이동">{demo?<button type="button" className={s.back} onClick={demo.onBack}><ArrowLeft size={19}/>채팅 목록</button>:<Link className={s.back} href="/chat"><ArrowLeft size={19}/>채팅 목록</Link>}{page?demo?<button className={s.map} type="button" onClick={demo.onMap}><MapPinned size={17}/>팀 지도</button>:<Link className={s.map} href={mapHref!}><MapPinned size={17}/>팀 지도</Link>:null}</nav>
  <header className={s.header}><span className={s.identity}>학과 대항전 · 우리 팀</span><div className={s.titleRow}><h1>{page?.title??'우리 팀 채팅'}</h1><button type="button" className={s.refresh} disabled={loading||busy} aria-label="우리 팀 채팅 새로고침" onClick={()=>void load()}><RefreshCw size={18}/></button></div>{page?<p>{page.department} <span>·</span> {LEAGUE_SPORTS[page.sport].label} <span>·</span> {page.member_count}/{LEAGUE_SPORTS[page.sport].capacity}명 확정</p>:null}<div className={s.privacy}><ShieldCheck size={16}/><span>확정된 우리 팀원끼리 전략과 시간을 이야기해요.</span></div></header>
  {demo?<p className={s.demo} role="note">체험용 팀 대화 · 이 화면에서 보낸 메시지는 실제 계정에 저장되지 않아요.</p>:null}
  {error?<div className={s.error} role="alert"><p>{error}</p><button type="button" disabled={loading||busy} onClick={()=>void load()}>다시 연결</button></div>:null}
  <section className={s.chat} aria-label="우리 팀 대화">
   {page?<ActivityRoomPolls roomKind="league-teams" roomId={pollFixture?.roomId??teamId} transport={pollFixture?.transport} composerRequest={pollRequest} readOnly={!page.writable}/>:null}
   <div ref={log} className={s.messages} role="log" aria-label="우리 팀 메시지" aria-live="polite" aria-relevant="additions text" onScroll={()=>{if(log.current)nearBottom.current=log.current.scrollHeight-log.current.scrollTop-log.current.clientHeight<72}}>
    {page?.has_more?<button type="button" className={s.older} disabled={loading||busy} onClick={()=>{if(page.next_cursor)void load(page.next_cursor)}}>{loading?'불러오는 중…':'이전 대화 보기'}</button>:null}
    {!page&&!error?<div className={s.empty} role="status"><MessageCircle size={30}/><p>팀 대화를 불러오고 있어요.</p></div>:page?.messages.length===0?<div className={s.empty}><MessageCircle size={32}/><h2>우리 팀의 첫 인사를 남겨요</h2><p>{page.member_count===1?'친구가 합류하기 전에도 계획을 남길 수 있어요.':'가능한 시간이나 하고 싶은 플레이부터 이야기해요.'}<br/>새로 합류한 팀원도 앞선 대화를 볼 수 있어요.</p></div>:page?.messages.map(message=><article key={message.id} data-social-message-id={message.id} className={`${s.message} ${message.is_me?s.mine:''}`}><strong>{message.is_me?'나':message.alias}</strong><div><p>{message.body}</p><time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString('ko-KR')}>{new Date(message.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div></article>)}
   </div>
   {page&&!page.writable?<p className={s.readOnly}>이 팀 대화는 현재 읽기만 가능해요.</p>:null}
   <form className={s.composer} onSubmit={event=>void send(event)}><ChatComposerActions disabled={busy||!page?.writable||!!error} onCreatePoll={()=>setPollRequest(value=>value+1)}/><label className={s.srOnly} htmlFor={`team-message-${teamId}`}>우리 팀에 보낼 메시지</label><textarea id={`team-message-${teamId}`} value={body} maxLength={1000} rows={2} placeholder="우리 팀에게 메시지 보내기" onChange={event=>setBody(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit()}}}/><button type="submit" aria-label="우리 팀 메시지 보내기" disabled={busy||!page?.writable||!!error||!body.trim()}><Send size={19}/><span>{busy?'전송 중':'보내기'}</span></button><small>우리 팀만 보는 대화 <span>{body.length}/1000</span></small></form>
  </section>
 </div></main>
}
