'use client'
import Link from 'next/link'
import {BookOpen,ChevronRight,MessagesSquare,Shield,UsersRound,Swords} from 'lucide-react'
import type {SocialChatRoom} from '@/lib/chat/social-rooms-contract'
import {SOCIAL_CHAT_LABELS,socialChatHref,socialChatTime,sortSocialChatRooms} from '@/lib/chat/social-room-presentation'
import s from './chat-belonging.module.css'

export default function SocialChatDirectory({rooms,onOpen}:{rooms:SocialChatRoom[];onOpen?:(room:SocialChatRoom)=>void}){
 return <div className={s.directory} aria-label="소속별 팀·모임 채팅">{sortSocialChatRooms(rooms).map(room=>{
  const href=socialChatHref(room);if(!href)return null
  const Icon=room.kind==='league_team'?Shield:room.kind==='league_match'?Swords:room.kind==='study_room'?BookOpen:room.kind==='mentoring'?MessagesSquare:UsersRound
  const content=<><span className={s.roomIcon} data-kind={room.kind}><Icon size={24}/></span><span className={s.rowBody}><span className={s.rowKind} data-kind={room.kind}>{SOCIAL_CHAT_LABELS[room.kind]}</span><strong>{room.title}</strong><span className={s.rowAffiliation}>{room.affiliation}</span><span className={s.rowPreview}>{room.latest_message?`${room.latest_message.is_me?'나: ':''}${room.latest_message.body}`:room.latest_message===null?'첫 인사를 남겨 보세요':'최근 대화 확인이 필요해요'}</span><span className={s.rowHint}>{room.member_count}명 · {room.writable?'대화하기':'읽기 전용'}{room.kind==='league_team'?' · 우리 팀만':room.kind==='league_match'?' · 상대 팀 포함':''}</span></span><span className={s.rowActivity}>{room.latest_message?<time dateTime={room.latest_message.created_at}>{socialChatTime(room.latest_message.created_at)}</time>:null}{room.unread_count!==undefined&&room.unread_count>0?<span className={s.unreadBadge} aria-label={`읽지 않은 대화 ${room.unread_count}개`}>{room.unread_count>99?'99+':room.unread_count}</span>:<ChevronRight size={19} className={s.chevron}/>}</span></>
  return onOpen?<button key={room.kind+':'+room.id} className={s.roomRow} onClick={()=>onOpen(room)} type="button">{content}</button>:<Link key={room.kind+':'+room.id} className={s.roomRow} href={href}>{content}</Link>
 })}</div>
}
export {SocialChatDirectory}
