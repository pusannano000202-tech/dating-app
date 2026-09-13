'use client'
import Link from 'next/link'
import {ArrowLeft,Menu,UsersRound} from 'lucide-react'
import type {RefObject} from 'react'
import type {SocialChatRoomKind} from '@/lib/chat/social-rooms-contract'
import {SOCIAL_CHAT_LABELS} from '@/lib/chat/social-room-presentation'
import s from './chat-belonging.module.css'

export type ChatAffiliation = {kind?:SocialChatRoomKind;title:string;categoryLabel?:string;affiliation?:string;memberCount?:number;detailHref?:string|null;detailLabel?:string;backHref?:string;onBack?:()=>void}
export default function ChatAffiliationHeader({kind,title,categoryLabel,memberCount,backHref='/chat',onBack,onMenu,menuOpen=false,menuId,menuButtonRef}:ChatAffiliation&{onMenu?:()=>void;menuOpen?:boolean;menuId?:string;menuButtonRef?:RefObject<HTMLButtonElement|null>}){
 return <header className={`${s.affiliationHeader} ${s.compactHeader}`}>
  {onBack?<button className={s.headerBack} type="button" aria-label="채팅 목록으로" onClick={onBack}><ArrowLeft size={22}/></button>:<Link className={s.headerBack} aria-label="채팅 목록으로" href={backHref}><ArrowLeft size={22}/></Link>}
  <div className={s.headerTitle}><h1>{title}</h1><p>{categoryLabel||kind?<span>{categoryLabel??(kind?SOCIAL_CHAT_LABELS[kind]:'')}</span>:null}{memberCount!==undefined?<span><UsersRound size={12}/>{memberCount}명</span>:null}</p></div>
  {onMenu?<button ref={menuButtonRef} className={s.headerMenu} type="button" aria-label="방 메뉴 열기" aria-expanded={menuOpen} aria-controls={menuId} onClick={onMenu}><Menu size={23}/></button>:null}
 </header>
}
export {ChatAffiliationHeader}
