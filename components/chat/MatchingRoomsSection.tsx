'use client'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import {CalendarClock,ChevronRight,LockKeyhole} from 'lucide-react'
import s from './chat-belonging.module.css'
type MatchRoom={match_id:string;match_status:string;matched_at:string;scheduled_start:string|null;venue_name:string|null;opp_group_size:number}
/** Listing does not grant chat access. Existing match routes/RPC time gates remain authoritative. */
export default function MatchingRoomsSection(){
 const [rooms,setRooms]=useState<MatchRoom[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading')
 const epoch=useRef(0),controller=useRef<AbortController|null>(null)
 const load=useCallback(async()=>{
  const ticket=++epoch.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setStatus('loading')
  try{
   const response=await fetch('/api/matches',{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])})
   const payload=await response.json()
   if(!response.ok||!Array.isArray(payload.matches))throw Error('invalid')
   const allowed=payload.matches.filter((m:MatchRoom)=>['confirmed','completed'].includes(m.match_status))
   if(allowed.some((m:MatchRoom)=>!m||typeof m.match_id!=='string'||!/^[a-f0-9-]{36}$/i.test(m.match_id)))throw Error('invalid')
   if(ticket===epoch.current){setRooms(allowed);setStatus('ready')}
  }catch{if(ticket===epoch.current){setRooms([]);setStatus('error')}}
 },[])
 const cancelLoad=useCallback(()=>{++epoch.current;controller.current?.abort()},[])
 useEffect(()=>{void load();return cancelLoad},[load,cancelLoad])
 return <section><p className={s.intro}><LockKeyhole size={15} className="inline"/> 매칭 대화는 기존 개방 조건을 그대로 따라요. 방이 목록에 보여도 개방 전에는 대화할 수 없어요.</p>
  {status==='loading'?<div className={s.empty} role="status">매칭 대화를 확인하고 있어요…</div>:status==='error'?<div className={s.error} role="alert">매칭 대화를 불러오지 못했어요.<button onClick={()=>void load()} type="button">다시 확인</button></div>:rooms.length?<div className={s.directory}>{rooms.map(room=><Link className={s.roomRow} key={room.match_id} href={'/match/'+encodeURIComponent(room.match_id)+'/chat'}><span className={s.roomIcon}><CalendarClock size={23}/></span><span className={s.rowBody}><span className={s.rowKind}>매칭 · 확정된 약속</span><strong>Quantum 만남 대화</strong><span className={s.rowAffiliation}>{room.scheduled_start?format(room.scheduled_start):'일정 확인 필요'} · {room.venue_name||'장소 확인 필요'}</span><span className={s.rowHint}>참여 권한·채팅 개방 시간 확인 후 입장</span></span><ChevronRight size={18}/></Link>)}</div>:<div className={s.empty}><strong>아직 확정된 매칭 대화가 없어요</strong><Link href="/match">매칭 확인하기 →</Link></div>}
 </section>
}
function format(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date):'일정 확인 필요'}
