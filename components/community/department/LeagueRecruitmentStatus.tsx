'use client'

import {ArrowRight,Check,ClipboardList} from 'lucide-react'
import type {Ref} from 'react'
import {useQuantumLocale} from '@/components/i18n/QuantumLocaleProvider'
import {LEAGUE_SPORTS,type JourneyPlayer,type JourneyTeam,type LeagueSport} from '@/lib/meetups/challenge-journey'
import {LeagueTierBadge} from './LeagueTier'
import {LeagueApplicationSummary} from './LeagueApplicationIntro'
import s from './league-recruitment-status.module.css'

export function leagueRecruitmentCounts(players:readonly JourneyPlayer[],capacity:number,invites:readonly {slot:string}[]=[]){
 const accepted=players.filter(player=>player.status==='accepted').length,requested=players.filter(player=>player.status==='requested').length
 return{accepted,requested,invited:new Set(invites.map(invite=>invite.slot)).size,capacity,full:accepted>=capacity}
}
export function leagueSlotState(players:readonly JourneyPlayer[],slot:string,invites:readonly {slot:string;alias?:string}[]=[]){
 return{occupant:players.find(player=>player.slot===slot&&player.status==='accepted'),requests:players.filter(player=>player.slot===slot&&player.status==='requested'),invited:invites.find(invite=>invite.slot===slot)}
}
export function leagueReviewNextStep(players:readonly JourneyPlayer[],reviewedPlayerId:string,slot:string|null):{state:'pending'|'status'}|{state:'review';slot:string|null}{
 const remaining=players.filter(player=>player.status==='requested')
 if(remaining.some(player=>player.id===reviewedPlayerId))return{state:'pending'}
 return remaining.length?{state:'review',slot:slot&&remaining.some(player=>player.slot===slot)?slot:null}:{state:'status'}
}
export function focusLeagueRecruitmentStatus(section:HTMLElement|null,reducedMotion:boolean){
 if(!section)return
 section.scrollIntoView({block:'start',behavior:reducedMotion?'auto':'smooth'})
 const target=section.querySelector<HTMLButtonElement>('[data-recruitment-action="opponent"]')??section
 target.focus({preventScroll:true})
}
export function LeagueRecruitmentStatus({team,capacity,pendingInvites,locked,busy=false,statusRef,onReview,onOpponent}:{team:JourneyTeam;capacity:number;pendingInvites:readonly {slot:string}[];locked:boolean;busy?:boolean;statusRef?:Ref<HTMLElement>;onReview:()=>void;onOpponent:()=>void}){
 const count=leagueRecruitmentCounts(team.players,capacity,pendingInvites),me=team.players.find(player=>player.is_me)
 return <section ref={statusRef} tabIndex={-1} className={s.status} aria-label="팀 모집 상태"><div className={s.counts} aria-live="polite"><strong>{count.accepted}/{capacity}명 확정</strong><span>검토 대기 <b>{count.requested}</b></span><span>초대 중 <b>{count.invited}</b></span></div>
  <p>{locked?'경기가 연결되어 팀 구성이 잠겨 있어요.':count.full?'정원을 채웠어요. 주장이 상대 팀을 직접 고릅니다.':team.is_captain&&count.requested?'신청자의 자리와 소개를 확인해 주세요. 읽어도 검토 대기는 유지돼요.':me?.status==='requested'?'주장 승인 전에는 확정 인원에 포함되지 않아요.':count.accepted+count.invited>=capacity?'남은 자리는 초대 수락을 기다려요. 수락한 친구만 확정 인원에 포함돼요.':`빈자리 ${Math.max(0,capacity-count.accepted-count.invited)}자리 · 이탈로 자리가 생기면 다시 모집할 수 있어요.`}</p>
  {!locked&&team.is_captain&&count.full?<button type="button" data-recruitment-action="opponent" className={s.primary} disabled={busy} onClick={onOpponent}>상대 팀 고르기<ArrowRight size={17} aria-hidden="true"/></button>:null}
  {!locked&&team.is_captain&&count.requested>0?<button type="button" className={count.full?s.secondary:s.primary} disabled={busy} onClick={onReview}><ClipboardList size={17} aria-hidden="true"/>신청 검토하기 · {count.requested}명<ArrowRight size={17} aria-hidden="true"/></button>:null}
 </section>
}
export function LeagueRequestReview({sport,team,slot,busy,message,onSelectAll,onClose,onDecide}:{sport:LeagueSport;team:JourneyTeam;slot:string|null;busy:boolean;message?:string;onSelectAll:()=>void;onClose:()=>void;onDecide:(player:JourneyPlayer,accept:boolean)=>void}){
 const{t}=useQuantumLocale(),requests=team.players.filter(player=>player.status==='requested'&&(!slot||player.slot===slot)),full=team.players.filter(player=>player.status==='accepted').length>=LEAGUE_SPORTS[sport].capacity
 if(!team.is_captain)return null
 return <section className={s.review} aria-label="참가 신청 검토"><header><div><small>주장만 검토할 수 있어요</small><h3>{slot?`${LEAGUE_SPORTS[sport].slots.find(item=>item.key===slot)?.label??slot} 신청 검토`:'참가 신청 검토'}</h3></div><button type="button" className={s.textButton} onClick={onClose}>지도 정보로</button></header>
  <p className={s.note}>신청·초대는 확정 인원과 달라요. 읽음 여부와 관계없이 승인 또는 거절로 처리해 주세요.</p>
  {message?<p className={s.note} role="status">{message}</p>:null}
  {slot?<button type="button" className={s.textButton} onClick={onSelectAll}>모든 자리 신청 보기</button>:null}
  {requests.length?requests.map(player=>{const occupied=team.players.some(member=>member.status==='accepted'&&member.slot===player.slot),blocked=full||occupied;return <article key={player.id} className={s.applicant} aria-label={`${player.alias} 참가 신청`}><header><strong>{player.alias}</strong><span>{player.slot?.toUpperCase()} · {sport==='lol'?<LeagueTierBadge tier={player.tier} label={player.tier?t(`challenge.${player.tier}`):'티어 미입력'}/>:player.tier?t(`challenge.${player.tier}`):'실력 미입력'}</span></header><LeagueApplicationSummary value={player.application_intro}/>{blocked?<p className={s.note}>이미 자리가 채워져 승인할 수 없어요. 남은 신청을 확인해 주세요.</p>:null}<div className={s.actions}><button type="button" data-review-decision="approve" className={s.primary} disabled={busy||blocked} onClick={()=>onDecide(player,true)}><Check size={16} aria-hidden="true"/>승인</button><button type="button" data-review-decision="reject" className={s.secondary} disabled={busy} onClick={()=>onDecide(player,false)}>신청 거절</button></div></article>}):<p className={s.empty} role="status">이 자리에서 검토할 신청이 없어요. 처리된 결과는 팀 지도와 인원에 반영됐어요.</p>}
 </section>
}
