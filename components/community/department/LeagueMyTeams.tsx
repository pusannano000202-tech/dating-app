'use client'

import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {ArrowRight,ChevronRight,MessageCircle,RefreshCw,X} from 'lucide-react'
import {LEAGUE_SPORTS,type LeagueSport} from '@/lib/meetups/challenge-journey'
import type {CandidateLeagueMembership,CandidateLeagueTeam} from '@/components/meetups/useCandidateLeagueMembership'
import DepartmentMascot from './DepartmentMascot'
import s from './league-my-teams.module.css'

type Props={membership:CandidateLeagueMembership;retry:()=>unknown;onChoose?:(team:CandidateLeagueTeam)=>void;demo?:boolean;sport?:LeagueSport;annotations?:Record<string,{isCaptain?:boolean;requests?:number}>;open?:boolean;onOpenChange?:(open:boolean)=>void}
/** Native modal keeps keyboard focus inside the team chooser and restores it. */
export default function LeagueMyTeams({membership,retry,onChoose,demo=false,sport='lol',annotations={},open:controlledOpen,onOpenChange}:Props){
 const [localOpen,setLocalOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null)
 const open=controlledOpen??localOpen
 const setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value)}
 useEffect(()=>{
  const node=dialog.current
  if(!node)return
  if(!open){if(node.open)node.close();return}
  if(!node.open)node.showModal()
  const previous=document.body.style.overflow;document.body.style.overflow='hidden'
  return()=>{document.body.style.overflow=previous;if(node.open)node.close()}
 },[open])
 const teams=membership.status==='member'?membership.teams:[],known=membership.status==='member'||membership.status==='none'
 const choose=(team:CandidateLeagueTeam)=>{setOpen(false);onChoose?.(team)}
 return <>
  <button type="button" className={s.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>내 팀 {known?teams.length:membership.status==='loading'?'…':'확인'}<ChevronRight size={15}/></button>
  <dialog className={s.sheet} ref={dialog} aria-labelledby="league-my-teams-title" onCancel={()=>setOpen(false)} onClick={event=>{if(event.target===dialog.current)setOpen(false)}}>
   <div className={s.content}>
    <header><div><h2 id="league-my-teams-title">참여 중인 팀{known?` ${teams.length}`:''}</h2><p>팀마다 신청과 대화를 따로 확인해요.</p></div><button type="button" className={s.close} aria-label="내 팀 닫기" onClick={()=>setOpen(false)}><X size={22}/></button></header>
    {demo?<p className={s.demo}>화면 확인용 예시 · 실제 가입 정보가 아니에요.</p>:null}
    {membership.status==='loading'?<p className={s.empty} role="status">내 팀을 불러오고 있어요.</p>:membership.status==='unavailable'?<div className={s.empty} role="alert"><p>내 팀을 확인하지 못했어요. 가입 정보가 삭제된 것은 아니에요.</p><button type="button" onClick={()=>void retry()}><RefreshCw size={16}/>다시 확인</button></div>:teams.length?<ul className={s.teams}>{teams.map(team=>{
     const annotation=annotations[team.id],copy=<><DepartmentMascot department={team.department} size={56}/><span><strong>{team.title}</strong><small>{LEAGUE_SPORTS[team.sport].label}{annotation?.isCaptain!==undefined?` · ${annotation.isCaptain?'주장':'팀원'}`:''} · {team.memberCount}/{LEAGUE_SPORTS[team.sport].capacity}명</small></span><ChevronRight size={18}/></>
     return <li key={team.id}><div className={s.teamRow}>{onChoose?<button type="button" onClick={()=>choose(team)} className={s.teamOpen}>{copy}</button>:<Link className={s.teamOpen} href={team.href} onClick={()=>setOpen(false)}>{copy}</Link>}</div><div className={s.actions}>{annotation?.isCaptain&&!!annotation.requests?<Link href={`${team.href}&panel=applications`} onClick={()=>setOpen(false)}>신청 {annotation.requests}명 확인</Link>:<span>{team.department}</span>}{!demo?<Link href={team.chatHref} onClick={()=>setOpen(false)} aria-label={`${team.title} 채팅 열기`}><MessageCircle size={14}/>채팅</Link>:null}</div></li>
    })}</ul>:<div className={s.empty}><h3>아직 참여 중인 팀이 없어요</h3><p>관심 있는 팀에 신청하거나 직접 팀을 만들어 보세요.</p></div>}
    <Link className={s.find} href={demo?`/meetups/dev-flow?scene=league&design=multiteam&flow=recruitment&sport=${sport}`:`/meetups/league?sport=${sport}&view=recruitment`} onClick={()=>setOpen(false)}>다른 팀 찾아보기<ArrowRight size={17}/></Link>
   </div>
  </dialog>
 </>
}
