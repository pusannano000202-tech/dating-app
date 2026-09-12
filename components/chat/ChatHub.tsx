'use client'
import {Suspense} from 'react'
import {useRouter,useSearchParams} from 'next/navigation'
import {chatListHref,parseChatTab} from '@/lib/navigation/chat-navigation'
import Link from 'next/link'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import ConversationList from '@/components/friends/ConversationList'
import {QuantumGuideEntry} from '@/components/notifications/NotificationSurfaces'
import SocialRoomsSection from './SocialRoomsSection'
import MatchingRoomsSection from './MatchingRoomsSection'
import s from './chat-belonging.module.css'

export default function ChatHub(){return <Suspense fallback={<main className={s.page}><p role="status">대화 목록을 준비하고 있어요…</p></main>}><ChatHubContent/></Suspense>}
function ChatHubContent(){
 const params=useSearchParams()
 const loginHref='/login?redirect='+encodeURIComponent(chatListHref(parseChatTab(params.get('tab'))))
 const account=useHistoryAccount()
 return <main className={s.page}><div className={s.shell}><header className={s.heading}><div><span className={s.eyebrow}>QUANTUM CHAT</span><h1>우리의 대화</h1></div></header><p className={s.intro}>어디서 만났는지, 누구와 이야기하는지.<br/>함께하는 모든 대화를 한곳에서 이어가요.</p><QuantumGuideEntry/>
  {!account||account==='unavailable'?<div className={s.empty} role="status">{account===undefined?'로그인 정보를 확인하고 있어요…':account==='unavailable'?'로그인 연결을 확인하지 못했어요. 다시 연결해 주세요.':'로그인하면 내가 참여한 대화를 볼 수 있어요.'}{account===null?<Link href={loginHref}>로그인하기 →</Link>:account==='unavailable'?<button type="button" className={s.more} onClick={()=>window.location.reload()}>다시 연결</button>:null}</div>:<OwnedChatHub key={account} ownerId={account}/>}
 </div></main>
}
function OwnedChatHub({ownerId}:{ownerId:string}){
 const params=useSearchParams(),router=useRouter()
 const tab=parseChatTab(params.get('tab'))
 return <><nav className={s.tabs} aria-label="채팅 종류">{([['social','팀·모임'],['matching','매칭'],['friends','친구']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>router.replace(chatListHref(value),{scroll:false})}>{label}</button>)}</nav>
  {tab==='social'?<SocialRoomsSection ownerId={ownerId}/>:tab==='matching'?<MatchingRoomsSection/>:<><ConversationList/><Link className={s.more} href="/friends">친구 목록·요청 관리</Link></>}
 </>
}
