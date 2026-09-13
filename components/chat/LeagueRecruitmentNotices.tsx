'use client'
import {useCallback,useEffect,useState} from 'react'
import {parseLeagueRoomNotices,type LeagueRoomNotice} from '@/lib/notifications/league-room-notices'
export default function LeagueRecruitmentNotices({teamId,ownerId}:{teamId:string;ownerId:string}){
 const [view,setView]=useState<{owner:string;team:string;notices:LeagueRoomNotice[];error:boolean}|null>(null)
 const [retry,setRetry]=useState(0)
 const refresh=useCallback(()=>setRetry(value=>value+1),[])
 useEffect(()=>{
  const controller=new AbortController();let busy=false
  const load=async()=>{if(busy||document.hidden)return;busy=true
   try{const response=await fetch(`/api/chat/league-team/notices?team_id=${encodeURIComponent(teamId)}`,{cache:'no-store',credentials:'same-origin',headers:{'X-Quantum-Owner':ownerId},signal:controller.signal}),data=await response.json()
    const notices=response.ok?parseLeagueRoomNotices(data,ownerId,teamId):null
    if(!notices)throw new Error('unavailable')
    if(!controller.signal.aborted)setView({owner:ownerId,team:teamId,notices,error:false})
   }catch{if(!controller.signal.aborted)setView({owner:ownerId,team:teamId,notices:[],error:true})}finally{busy=false}}
  void load();const timer=setInterval(()=>void load(),15000)
  const visible=()=>{if(!document.hidden)void load()};document.addEventListener('visibilitychange',visible)
  return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
 },[teamId,ownerId,retry])
 if(!view||view.owner!==ownerId||view.team!==teamId)return null
 if(view.error)return <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600" role="status">모집 소식을 불러오지 못했어요. <button type="button" className="min-h-11 font-bold underline" onClick={refresh}>다시 확인</button></div>
 if(!view.notices.length)return null
 return <aside aria-label="우리 팀 모집 소식" className="space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{view.notices.slice(-3).map(note=><p key={note.id}><span className="mr-2 font-bold">퀀텀 안내</span>{note.body}</p>)}</aside>
}
