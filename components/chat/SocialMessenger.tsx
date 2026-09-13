'use client'

import Link from 'next/link'
import {createContext,useContext,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react'
import {ArrowDown,MessageCircle,Send,X} from 'lucide-react'
import ChatAffiliationHeader,{type ChatAffiliation} from './ChatAffiliationHeader'
import ChatComposerActions from '@/components/chat-polls/ChatComposerActions'
import {chatScrollChange,isNearChatBottom,type SocialMessage} from '@/lib/chat/social-messenger-state'
import s from './social-messenger.module.css'

export const SocialChatRoomContext=createContext<ChatAffiliation|null>(null)
const OpenRoomMenuContext=createContext<(()=>void)|null>(null)

export function SocialChatComposer({value,onChange,onSend,busy=false,disabled=false,onCreatePoll,label='메시지 입력',placeholder='편하게 이야기해 보세요'}:{value:string;onChange:(value:string)=>void;onSend:()=>void;busy?:boolean;disabled?:boolean;onCreatePoll?:()=>void;label?:string;placeholder?:string}){
 const textarea=useRef<HTMLTextAreaElement>(null)
 const openMenu=useContext(OpenRoomMenuContext)
 useLayoutEffect(()=>{const element=textarea.current;if(element){element.style.height='auto';const style=window.getComputedStyle(element),borders=(Number.parseFloat(style.borderTopWidth)||0)+(Number.parseFloat(style.borderBottomWidth)||0),height=Math.ceil(element.scrollHeight+borders);element.style.height=`${Math.min(height,112)}px`;element.style.overflowY=height>112?'auto':'hidden'}},[value])
 return <form className={s.composer} aria-busy={busy} onSubmit={event=>{event.preventDefault();if(!busy&&!disabled&&value.trim())onSend()}}>
  {onCreatePoll?<ChatComposerActions onCreatePoll={()=>{openMenu?.();onCreatePoll()}} disabled={disabled||busy}/>:null}
  <textarea ref={textarea} rows={1} aria-label={label} placeholder={disabled?'현재 새 메시지를 보낼 수 없어요':placeholder} maxLength={1000} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit()}}}/>
  <button type="submit" aria-label={busy?'메시지 전송 중':'메시지 보내기'} disabled={busy||disabled||!value.trim()}><Send size={19}/></button>
  {busy?<span className={s.sending} role="status">전송 결과를 확인하고 있어요. 다음 메시지는 계속 적을 수 있어요.</span>:null}
 </form>
}

export default function SocialMessenger({messages,scope,root,composer,tools,management,error,onRetry,loading=false,readOnly=false,empty='첫 인사를 남겨보세요',beforeMessages,notice,header}:{messages:SocialMessage[];scope:string;root?:RefObject<HTMLDivElement|null>;composer:ReactNode;tools?:ReactNode;management?:ReactNode|((close:()=>void)=>ReactNode);error?:string;onRetry?:()=>void;loading?:boolean;readOnly?:boolean;empty?:string;beforeMessages?:ReactNode;notice?:ReactNode;header?:ChatAffiliation}){
 const inheritedHeader=useContext(SocialChatRoomContext),roomHeader=header??inheritedHeader??{title:'모임 대화'}
 const menuId=useId()
 const log=useRef<HTMLDivElement|null>(null),nearBottom=useRef(true),last=useRef({scope:'',ids:[] as string[],height:0,top:0})
 const [newMessages,setNewMessages]=useState(false),[manage,setManage]=useState(false)
 const panel=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null),manageButton=useRef<HTMLButtonElement>(null)
 const closeMenu=()=>{setManage(false);manageButton.current?.focus()}
 const jump=()=>{const element=log.current;if(element){element.scrollTop=element.scrollHeight;nearBottom.current=true;setNewMessages(false)}}
 useLayoutEffect(()=>{
  const element=log.current;if(!element)return
  const ids=messages.map(message=>message.id),previous=last.current,change=chatScrollChange(previous.scope===scope?previous.ids:[],ids)
  if(change==='initial'||(change==='append'&&nearBottom.current)){element.scrollTop=element.scrollHeight;setNewMessages(false)}
  else if(change==='prepend')element.scrollTop=previous.top+element.scrollHeight-previous.height
  else if(change==='append')setNewMessages(true)
  last.current={scope,ids,height:element.scrollHeight,top:element.scrollTop}
 },[messages,scope])
 useEffect(()=>{setManage(false);setNewMessages(false);nearBottom.current=true},[scope])
 useEffect(()=>{if(!manage)return;close.current?.focus();const key=(event:KeyboardEvent)=>{const nested=(event.target as HTMLElement|null)?.closest?.('[role="dialog"]');if(nested&&nested!==panel.current)return;if(event.key==='Escape'){setManage(false);manageButton.current?.focus()}if(event.key==='Tab'&&panel.current){const nodes=[...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(node=>node.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[manage])
 return <OpenRoomMenuContext.Provider value={()=>setManage(true)}><section className={s.messenger} aria-label="참가자 대화">
  <ChatAffiliationHeader {...roomHeader} onMenu={()=>setManage(true)} menuOpen={manage} menuId={menuId} menuButtonRef={manageButton}/>
  {error?<div className={s.error} role="alert"><span>{error}</span>{onRetry?<button type="button" onClick={onRetry}>다시 연결</button>:null}</div>:null}
  {readOnly?<p className={s.readOnly} role="status">참여가 종료되어 지금은 이전 대화만 볼 수 있어요.</p>:null}
  <div className={s.history}>
   <div className={s.log} ref={element=>{log.current=element;if(root)root.current=element}} role="log" aria-label="모임 메시지" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={()=>{const element=log.current;if(!element)return;nearBottom.current=isNearChatBottom(element.scrollHeight,element.scrollTop,element.clientHeight);last.current.height=element.scrollHeight;last.current.top=element.scrollTop;if(nearBottom.current)setNewMessages(false)}}>
    {beforeMessages}
    {messages.some(message=>message.isMe===null)?<p className={s.identityNotice} role="status">일부 대화는 보낸 사람 확인이 필요해요.</p>:null}
    {loading&&!messages.length?<p className={s.empty} role="status">대화를 불러오고 있어요…</p>:!error&&!messages.length?<div className={s.empty}><MessageCircle size={28}/><strong>{empty}</strong><span>시간과 장소도 여기서 편하게 상의해요.</span></div>:null}
    {messages.map((message,index)=>{const prior=messages[index-1],date=new Date(message.createdAt),newDate=!prior||new Date(prior.createdAt).toDateString()!==date.toDateString();return <div className={s.messageRow} key={message.id}>{newDate?<p className={s.day}>{date.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})}</p>:null}<article data-social-message-id={message.id} data-authorship={message.isMe===true?'mine':message.isMe===false?'other':'unknown'} className={`${s.message} ${message.isMe===true?s.mine:message.isMe===null?s.unknown:''}`}><small>{message.isMe===true?'나':message.alias}{message.isMe===null?' · 보낸 사람 확인 필요':''}</small><div className={s.bubbleLine}><p>{message.text}</p><time dateTime={message.createdAt} title={date.toLocaleString('ko-KR')}>{date.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time></div></article></div>})}
   </div>
   {newMessages?<button className={s.newMessages} type="button" onClick={jump}>새 메시지 보기<ArrowDown size={16}/></button>:null}
  </div>
  <footer className={s.footer}>{composer}</footer>
  <div className={s.overlay} hidden={!manage} onMouseDown={event=>{if(event.target===event.currentTarget)closeMenu()}}><div id={menuId} className={s.panel} ref={panel} role="dialog" aria-modal="true" aria-label="방 메뉴"><header><h2>방 메뉴</h2><button type="button" ref={close} aria-label="방 메뉴 닫기" onClick={closeMenu}><X size={22}/></button></header><div className={s.roomSummary}><strong>{roomHeader.title}</strong>{roomHeader.affiliation?<p>{roomHeader.affiliation}</p>:null}{roomHeader.memberCount!==undefined?<p>참가자 {roomHeader.memberCount}명</p>:null}<p>{roomHeader.kind==='league_team'?'우리 팀원만 보는 대화예요. 상대 팀에는 공개되지 않아요.':roomHeader.kind==='league_match'?'상대 팀도 함께 보는 경기 조율방이에요.':'이 모임에 참여한 사람들과 나누는 대화예요.'}</p>{roomHeader.detailHref?<Link href={roomHeader.detailHref}>{roomHeader.detailLabel??'방 정보·참여 관리 보기'}</Link>:null}</div>{tools?<div className={s.tools}><h3>투표·약속</h3>{tools}</div>:null}{notice?<div className={s.notice}>{notice}</div>:null}{management?<div className={s.management}><h3>모임·일정·참가자 관리</h3>{typeof management==='function'?management(closeMenu):management}</div>:null}</div></div>
 </section></OpenRoomMenuContext.Provider>
}
