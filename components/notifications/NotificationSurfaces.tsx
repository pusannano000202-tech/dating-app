'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,Bell,CheckCheck,ChevronRight,MessageCircle,RefreshCw,ShieldCheck,Sparkles,X} from 'lucide-react'
import {useNotifications} from './NotificationsProvider'
import {notificationPresentation,notificationTime} from '@/lib/notifications/common-presentation'
import {notificationEmptyState,resolveSocialLink,type NotificationRow} from '@/lib/notifications/common-contract'
import s from './notifications.module.css'
import PushNotificationSettings from './PushNotificationSettings'

export function NotificationCard({row,message=false,onOpen}:{row:NotificationRow;message?:boolean;onOpen?:(row:NotificationRow)=>void}){
 const {markRead}=useNotifications(),router=useRouter(),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const version=useRef(0)
 useEffect(()=>()=>{version.current++},[])
 const p=notificationPresentation(row)
 async function open(){
  if(busy)return
  if(onOpen){onOpen(row);return}
  const ticket=++version.current;setBusy(true);setNotice('')
  try{
   let href=p.href
   if(row.kind==='social_activity'||row.kind==='social_chat_message'){
    const response=await fetch('/api/notifications/'+(row.kind==='social_chat_message'?'chat':'social')+'?id='+encodeURIComponent(row.id),{cache:'no-store',signal:AbortSignal.timeout(12000)})
    const result=await response.json()
    if(ticket!==version.current)return
    if(!response.ok)throw Error('unavailable')
    if(result.status==='ended'){await markRead(row.id);if(ticket===version.current)setNotice('이미 처리되었거나 참여가 종료된 안내예요. 다른 방으로 이동하지 않아요.');return}
    href=resolveSocialLink(result)
    if(!href)throw Error('invalid_target')
   }
   await markRead(row.id)
   if(ticket===version.current&&href)router.push(href)
  }catch{if(ticket===version.current)setNotice('현재 상태를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.')}
  finally{if(ticket===version.current)setBusy(false)}
 }
 return <article className={[s.card,!row.read_at?s.unread:'',message?s.message:''].join(' ')}>
  <div className={s.cardMeta}><span>{p.label}</span><time dateTime={row.created_at}>{notificationTime(row.created_at)}</time>{!row.read_at?<span className={s.dot} aria-label="읽지 않음"/>:null}</div>
  {p.context?<p className={s.context}>{p.context}</p>:null}
  <h2>{p.title}</h2><p>{p.summary}</p>
  {row.kind==='match_created'?<div className={s.matchHint}>가매칭 · 상대 상세는 확정 후 공개<br/>먼저 사전 카드와 보증금을 확인해 주세요.</div>:null}
  <button type="button" className={s.cardAction} onClick={()=>void open()} disabled={busy}>{busy?'현재 상태 확인 중…':p.action}<ArrowRight size={17}/></button>
  {notice?<p className={s.terminal} role="status">{notice}</p>:null}
 </article>
}

export function QuantumGuideEntry({href='/chat/quantum'}:{href?:string}){
 const {items,unread,status}=useNotifications()
 const latest=items[0]?notificationPresentation(items[0]):null
 return <Link href={href} className={s.guideEntry}><span className={s.guideIcon}><Sparkles size={24}/></span><span className={s.guideText}><strong>퀀텀 안내 <ShieldCheck size={13}/></strong><small>{status==='unavailable'?'알림 연결 확인이 필요해요':status==='loading'?'새 안내를 확인하고 있어요':latest?.title??'모집 신청·초대·참가 소식을 여기에 모아드려요'}</small></span>{unread!==null&&unread>0?<span className={s.badge} aria-label={'읽지 않은 안내 '+unread+'개'}>{unread>99?'99+':unread}</span>:<ChevronRight size={18}/>}</Link>
}

export function NotificationArrival(){
 const {arrival,dismissArrival}=useNotifications()
 useEffect(()=>{if(!arrival)return;const timer=window.setTimeout(dismissArrival,8000);return()=>window.clearTimeout(timer)},[arrival,dismissArrival])
 if(!arrival)return null
 const p=notificationPresentation(arrival)
 return <aside className={s.toast} role="status"><span className={s.toastIcon}><Bell size={19}/></span><Link href="/notifications"><strong>{p.title}</strong><span>알림함에서 확인하기 <ChevronRight size={12}/></span></Link><button aria-label="도착 안내 닫기" onClick={dismissArrival}><X size={18}/></button></aside>
}

export function NotificationsScreen({message=false,embedded=false,onOpen}:{message?:boolean;embedded?:boolean;onOpen?:(row:NotificationRow)=>void}){
 const {items,unread,status,hasMore,busy,error,refresh,loadMore,markRead,ownerId}=useNotifications(),[filter,setFilter]=useState<'all'|'unread'>('all'),[reading,setReading]=useState(false)
 const rows=filter==='unread'?items.filter(n=>!n.read_at):items
 const emptyState=notificationEmptyState(filter,unread,hasMore)
 return <main className={embedded?s.embedded:s.page}><div className={s.shell}>
  <header className={s.header}>{!embedded?<Link href={message?'/chat':'/'} aria-label={message?'채팅 목록으로':'홈으로'} className={s.iconButton}><ArrowLeft size={20}/></Link>:null}<div><span className={s.eyebrow}>QUANTUM {message?'GUIDE':'INBOX'}</span><h1>{message?'퀀텀 안내':'내게 온 소식'}</h1></div><button className={s.iconButton} aria-label="알림 새로고침" onClick={()=>void refresh()}><RefreshCw size={18}/></button></header>
  <p className={s.intro}>{message?'신청이 도착할 때부터 함께 모일 때까지. 놓치지 않도록 알려드려요.':'어디에 있든, 내가 참여한 모임의 변화를 한눈에.'}</p>
  {message?<div className={s.systemNote}><ShieldCheck size={18}/><span>퀀텀이 보내는 안내 전용 대화예요.<br/>멤버와의 대화는 해당 모임 채팅에서 이어가세요.</span></div>:<Link href="/chat/quantum" className={s.guideLink}><MessageCircle size={17}/>채팅에서도 ‘퀀텀 안내’로 다시 볼 수 있어요<ChevronRight size={15}/></Link>}
  <div className={s.toolbar}><div className={s.filters}><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>전체</button><button aria-pressed={filter==='unread'} onClick={()=>setFilter('unread')}>안 읽음 {unread!==null?unread:''}</button></div><button className={s.readAll} disabled={reading||status!=='ready'||!unread} onClick={async()=>{setReading(true);try{await markRead()}finally{setReading(false)}}}><CheckCheck size={15}/>모두 읽음</button></div>
  {error?<section role="alert" className={s.error}>{error}<button onClick={()=>void refresh()}>다시 확인</button></section>:null}
  {status==='auth_required'?<section className={s.empty}><Bell size={28}/><h2>로그인하고 소식을 받아보세요</h2><p>나에게 온 알림만 안전하게 보여드려요.</p><Link href={'/login?redirect='+encodeURIComponent(message?'/chat/quantum':'/notifications')}>로그인</Link></section>
  :status==='loading'?<div role="status" className={s.empty}>새 소식을 불러오고 있어요…</div>
  :rows.length?<div className={s.list}>{rows.map(row=><NotificationCard key={row.id} row={row} message={message} onOpen={onOpen}/>)}</div>
  :status==='ready'?<section className={s.empty}><Bell size={28}/><h2>{emptyState==='all_read'?'새 소식을 모두 확인했어요':emptyState==='older_unread'?'이전 안내에 읽지 않은 소식이 남아 있어요':emptyState==='refresh_unread'?'새 안내를 다시 확인해 주세요':emptyState==='unknown'?'읽지 않은 소식을 확인하고 있어요':'아직 도착한 소식이 없어요'}</h2><p>{emptyState==='older_unread'?'현재 불러온 항목에는 없어요. 아래에서 이전 안내를 이어서 확인하세요.':emptyState==='refresh_unread'?'알림 수와 목록이 달라졌어요. 새로고침하면 최신 상태를 확인할 수 있어요.':'신청·초대·참가 결과가 생기면 이곳에 남아요.'}</p></section>:null}
  {hasMore?<button className={s.more} disabled={busy} onClick={()=>void loadMore()}>{busy?'이전 안내 불러오는 중…':filter==='unread'?'이전 안내에서 읽지 않은 소식 확인':'이전 안내 더 보기'}</button>:null}
  {!message&&!embedded&&ownerId&&status==='ready'?<PushNotificationSettings key={ownerId} ownerId={ownerId}/>:null}
  <p className={s.footnote}>알림을 읽어도 신청이 자동 승인되지는 않아요.<br/>기기 알림을 켜면 지원되는 휴대폰·브라우저에서 앱 밖 소식도 받을 수 있어요. 문자는 별도로 발송하지 않아요.</p>
 </div></main>
}
