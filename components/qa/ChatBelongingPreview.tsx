'use client'
import {useState} from 'react'
import Link from 'next/link'
import {ArrowLeft} from 'lucide-react'
import AppBottomNav from '@/components/navigation/AppBottomNav'
import ChatAffiliationHeader from '@/components/chat/ChatAffiliationHeader'
import SocialChatDirectory from '@/components/chat/SocialChatDirectory'
import type {SocialChatRoom} from '@/lib/chat/social-rooms-contract'
import s from '@/components/chat/chat-belonging.module.css'
const entries:[SocialChatRoom['kind'],string,string,number][]=[
 ['league_team','기계과 한 판','기계공학부 · LoL 5 대 5',2],
 ['league_match','기계공학부 vs 전자공학과','우리 학교 리그 · LoL 5 대 5',10],
 ['activity_room','오늘 저녁 같이 먹어요 · 1번 방','같이 놀 사람 · 저녁 식사',4],
 ['study_room','공학 미적분 같이 풀어요','우리 과끼리 · 전공 스터디',5],
 ['mentoring','둘씩 만나면 더 편하게','우리 과끼리 · 선배 2명 + 후배 2명',4],
 ['meetup','주말 보드게임 친구들','같이 놀 사람 · 보드게임',3],
]
const previews=['오늘 8시 어때요? 투표 올려 뒀어요.','양 팀이 함께 장소를 정해요.','학교 정문 앞에서 만나요!','다음엔 3장까지 같이 풀어요.','먼저 궁금한 점 하나씩 나눠요.','이번 주 토요일 괜찮으세요?']
const rooms:SocialChatRoom[]=entries.map(([kind,title,affiliation,member_count],index)=>({kind,title,affiliation,member_count,id:'95000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),writable:true,updated_at:'2026-09-11T00:00:00Z',latest_message:{id:'96000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),body:previews[index],created_at:'2026-09-11T00:'+String(30-index).padStart(2,'0')+':00Z',is_me:index===4},unread_count:[3,1,2,0,0,1][index]}))
export default function ChatBelongingPreview(){
 const[selected,setSelected]=useState<SocialChatRoom|null>(null)
 return <><main className={s.page}><div className={s.shell}>
  <aside className={s.demoBar}>로컬 소속 표시 리허설 · 이름·인원은 예시이며 실제 계정 정보가 아니에요.</aside>
  {selected?<><ChatAffiliationHeader kind={selected.kind} title={selected.title} affiliation={selected.affiliation} memberCount={selected.member_count} onBack={()=>setSelected(null)}/>
   <section className={s.empty}><strong>소속 표시는 대화 중에도 유지돼요</strong><p>이 화면은 공통 채팅 목록·상단 표시 확인용입니다. 실제 대화는 각 방의 기존 저장소에 연결됩니다.</p><Link className={s.more} href="/meetups/dev-flow?scene=league&flow=invites&sport=lol">팀 만들기 → 초대 수락 → 대화 흐름 직접 체험</Link></section></>
  :<><header className={s.heading}><div><span className={s.eyebrow}>QUANTUM CHAT</span><h1>우리의 대화</h1></div></header><p className={s.intro}>어디서 만났는지, 누구와 이야기하는지.<br/>함께하는 모든 대화를 한곳에서 이어가요.</p>
   <nav className={s.tabs} aria-label="예시 채팅 종류"><button type="button" aria-pressed="true">팀·모임</button><Link href="/chat?tab=matching">매칭</Link><Link href="/chat?tab=friends">친구</Link></nav>
   <div className={s.sectionHeading}><h2>내 팀·모임 대화</h2><span>소속 예시 6개</span></div><SocialChatDirectory rooms={rooms} onOpen={room=>{setSelected(room);window.scrollTo({top:0,behavior:'instant'})}}/>
   <p className={s.note}>우리 팀 전략방은 우리 팀원만, 경기 조율방은 양 팀이 함께 봅니다. 매칭은 기존 채팅 개방 시간을 따릅니다.</p><Link className={s.detail} href="/meetups/dev-flow?scene=league&flow=invites&sport=lol"><ArrowLeft size={15}/> 초대부터 직접 체험하기</Link></>}
 </div></main><AppBottomNav previewPathname="/chat"/></>
}
