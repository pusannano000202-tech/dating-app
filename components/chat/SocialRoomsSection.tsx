'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {parseSocialRoomsResponse,type SocialChatRoom} from '@/lib/chat/social-rooms-contract'
import {mergeSocialChatRooms} from '@/lib/chat/social-room-presentation'
import SocialChatDirectory from './SocialChatDirectory'
import s from './chat-belonging.module.css'

/** Mounted with the account as its key: neither responses nor drafts cross accounts. */
export default function SocialRoomsSection({ownerId}:{ownerId:string}){
 const [rooms,setRooms]=useState<SocialChatRoom[]>([]),[cursor,setCursor]=useState<string|null>(null)
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[busy,setBusy]=useState(false)
 const epoch=useRef(0),controller=useRef<AbortController|null>(null),pages=useRef(1),inFlight=useRef(false)
 const load=useCallback(async(more?:string)=>{
  if(inFlight.current)return
  inFlight.current=true;const ticket=++epoch.current;const abort=new AbortController();controller.current=abort;setBusy(true)
  const timeout=window.setTimeout(()=>abort.abort(),15000)
  try{
   let next=more??null,all:SocialChatRoom[]=[],count=0
   do{
    const response=await fetch('/api/chat/social-rooms'+(next?'?cursor='+encodeURIComponent(next):''),{cache:'no-store',signal:abort.signal})
    const page=response.ok?parseSocialRoomsResponse(await response.json(),ownerId):null
    if(!page)throw Error('unavailable')
    if(ticket!==epoch.current)return
    all=mergeSocialChatRooms(all,page.rooms);next=page.next_cursor;count++
   }while(!more&&next&&count<pages.current)
   setRooms(previous=>more?mergeSocialChatRooms(previous,all):all);setCursor(next)
   if(more)pages.current++;else pages.current=count
   setStatus('ready')
  }catch{if(ticket===epoch.current){setRooms([]);setCursor(null);setStatus('error')}}
  finally{window.clearTimeout(timeout);if(ticket===epoch.current){inFlight.current=false;setBusy(false)}}
 },[ownerId])
 const cancelLoad=useCallback(()=>{++epoch.current;controller.current?.abort();inFlight.current=false},[])
 useEffect(()=>{
  void load()
  const wake=()=>{if(document.visibilityState==='visible')void load()}
  const timer=window.setInterval(wake,15000);window.addEventListener('focus',wake);window.addEventListener('social-chat-read',wake);document.addEventListener('visibilitychange',wake)
  return()=>{cancelLoad();window.clearInterval(timer);window.removeEventListener('focus',wake);window.removeEventListener('social-chat-read',wake);document.removeEventListener('visibilitychange',wake)}
 },[load,cancelLoad])
 return <section><div className={s.sectionHeading}><h2>내 팀·모임 대화</h2>{status==='ready'?<span>{rooms.length}개{cursor?' 이상':''}</span>:null}</div>
  {status==='loading'?<div className={s.empty} role="status">내가 참여한 방을 확인하고 있어요…</div>:status==='error'?<div className={s.error} role="alert">참여한 대화를 불러오지 못했어요. 빈 목록으로 표시하지 않았어요.<button type="button" disabled={busy} onClick={()=>void load()}>다시 확인</button></div>:rooms.length?<SocialChatDirectory rooms={rooms}/>:<div className={s.empty}><strong>함께할 방이 생기면 여기에 남아요</strong>모임에 참가하거나 팀 초대를 수락하면 바로 대화를 이어갈 수 있어요.<br/><Link href="/meetups">모임 둘러보기 →</Link></div>}
  {cursor?<button className={s.more} type="button" disabled={busy} onClick={()=>void load(cursor)}>{busy?'대화를 확인하는 중…':'참여한 대화 더 보기'}</button>:null}
  <p className={s.note}>우리 팀 전략방과 상대 팀도 보는 경기방은 따로예요. 방의 소속 표시를 확인해 주세요.</p>
 </section>
}
