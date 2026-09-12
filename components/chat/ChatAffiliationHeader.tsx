'use client'
import Link from 'next/link'
import {ArrowLeft,ChevronRight,ShieldCheck,UsersRound} from 'lucide-react'
import type {SocialChatRoomKind} from '@/lib/chat/social-rooms-contract'
import {SOCIAL_CHAT_LABELS} from '@/lib/chat/social-room-presentation'
import s from './chat-belonging.module.css'

export default function ChatAffiliationHeader({kind,title,affiliation,memberCount,detailHref,backHref='/chat',onBack}:{kind:SocialChatRoomKind;title:string;affiliation:string;memberCount:number;detailHref?:string|null;backHref?:string;onBack?:()=>void}){
 return <header className={s.affiliationHeader}>
  <div className={s.roomTop}>{onBack?<button className={s.back} type="button" onClick={onBack}><ArrowLeft size={18}/>채팅 목록</button>:<Link className={s.back} href={backHref}><ArrowLeft size={18}/>채팅 목록</Link>}<span className={s.roomType} data-kind={kind}>{SOCIAL_CHAT_LABELS[kind]}</span></div>
  <h1>{title}</h1><div className={s.roomMeta}><span>{affiliation}</span><span><UsersRound size={14}/>{memberCount}명</span></div>
  {kind==='league_team'?<p className={s.audience}><ShieldCheck size={15}/>우리 팀원만 보는 대화예요. 상대 팀에는 공개되지 않아요.</p>:kind==='league_match'?<p className={s.audience}><UsersRound size={15}/>상대 팀도 함께 보는 경기 조율방이에요.</p>:<p className={s.audience}><ShieldCheck size={15}/>이 모임에 참여한 사람들과 나누는 대화예요.</p>}
  {detailHref?<Link className={s.detail} href={detailHref}>소속·활동 정보 보기<ChevronRight size={15}/></Link>:null}
 </header>
}
export {ChatAffiliationHeader}
