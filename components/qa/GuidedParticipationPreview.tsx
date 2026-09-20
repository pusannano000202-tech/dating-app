'use client'

import Image from 'next/image'
import {useState} from 'react'
import AppBottomNav from '@/components/navigation/AppBottomNav'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, FlaskConical } from 'lucide-react'
import DepartmentLeagueJourney from '@/components/community/department/DepartmentLeagueJourney'
import MentoringExperience from '@/components/meetups/MentoringExperience'
import DepartmentCourseDiscovery from '@/components/meetups/DepartmentCourseDiscovery'
import type { LeagueRankingExample } from '@/lib/meetups/challenge-journey-demo'
import type { LeagueSport } from '@/lib/meetups/challenge-journey'
import s from './guided-participation-preview.module.css'

type Scene = 'overview' | 'league' | 'mentoring' | 'courses'
const paths = [
  { id: 'league', title: '우리 과의 한 판', detail: '우리 과 팀 찾기 → 지도에서 참가 → 상대 제안·경기 채팅', image: '/social-scenes/department-clubhouse-gaming.webp' },
  { id: 'mentoring', title: '둘씩 만나면, 더 편하게', detail: '경험을 나누는 2명 + 도움을 구하는 2명', image: '/images/quantum-campus-group.webp' },
  { id: 'courses', title: '내 수업, 같이 풀어요', detail: '내 학과와 과목에 맞는 공부 모임', image: '/social-scenes/course-calculus.png' },
] as const

export default function GuidedParticipationPreview({ scene, ranking='empty', sport='lol', flow='league',design=false }: { scene: Scene; ranking?: LeagueRankingExample; sport?: LeagueSport; flow?: 'league'|'invites'|'recruitment';design?:boolean }) {
  const [chatView,setChatView]=useState(false)
  return <div className={s.root}>
    <aside className={s.notice} aria-label="개발용 예시 안내">
      {scene !== 'overview' ? <Link href="/meetups/dev-flow" aria-label="체험 목록"><ArrowLeft size={16} /></Link> : <FlaskConical size={16} />}
      <span><strong>예시 체험</strong> · 실제 참가·초대·전송·신고는 하지 않아요.</span>
    </aside>
    {scene === 'league' ? <>
      {chatView||design ? null : flow !== 'league' ? <nav className={`${s.examples} ${s.inviteExamples}`} aria-label={flow==='recruitment'?'우리 과 모집 종목 선택':'지도 초대 종목 선택'}>
        {([['lol','LoL'],['futsal','풋살 6명'],['football','축구 11명']] as const).map(([value,label])=><Link key={value} href={`/meetups/dev-flow?scene=league&flow=${flow}&sport=${value}`} aria-current={sport===value?'page':undefined}>{label}</Link>)}
        <Link href={`/meetups/dev-flow?scene=league&flow=${flow==='recruitment'?'invites':'recruitment'}&sport=${sport}`}>{flow==='recruitment'?'친구 초대 →':'우리 과 모집 →'}</Link>
      </nav> : <nav className={s.examples} aria-label="순위 예시 선택">
        <span>순위·점수는 예시</span>
        {([['empty','경기 전'],['leaders','1·2·3위'],['ties','공동 1위']] as const).map(([value,label])=><Link key={value} href={`/meetups/dev-flow?scene=league&ranking=${value}`} aria-current={ranking===value?'page':undefined}>{label}</Link>)}
        <Link href="/meetups/dev-flow?scene=league&flow=invites&sport=lol">팀 개설·친구 초대 체험</Link>
        <Link href="/meetups/dev-flow?scene=league&flow=recruitment&sport=lol">우리 과 팀 찾기·모집 소식</Link>
      </nav>}
      <DepartmentLeagueJourney key={`${sport}-${flow}-${ranking}`} demo demoDesign={design} initialSport={sport} demoRanking={ranking} demoFlow={flow} onDemoChatViewChange={setChatView} />
    </>
      : scene === 'mentoring' ? <MentoringExperience demo />
      : scene === 'courses' ? <DepartmentCourseDiscovery demo />
      : <main className={s.overview}>
        <p className={s.eyebrow}>QUANTUM · FLOW PREVIEW</p>
        <h1>만나기 전부터,<br />만난 다음까지.</h1>
        <p className={s.intro}>예시 친구들과 직접 눌러보세요.<br />실제 화면과 같은 구성으로 흐름을 확인해요.</p>
        <nav className={s.cards} aria-label="체험할 참여 흐름">
          {paths.map(item => <Link key={item.id} href={`/meetups/dev-flow?scene=${item.id}`} className={s.card}>
            <Image src={item.image} alt="" width={480} height={320} />
            <div><h2>{item.title}</h2><p>{item.detail}</p><span>흐름 체험하기 <ArrowRight size={16} /></span></div>
          </Link>)}
        </nav>
        <Link href="/meetups/dev-flow?scene=league&flow=recruitment&sport=lol" className={s.study}>우리 과 팀 찾기 → 빈자리 신청 → 모집 소식 올리기 <ArrowRight size={16} /></Link>
        <Link href="/meetups/dev-flow?scene=league&flow=invites&sport=lol" className={s.study}>지도에서 팀 만들기 → 빈자리로 초대 → 친구 시점으로 수락 <ArrowRight size={16} /></Link>
        <Link href="/meetups/study-preview" className={s.study}>스터디 참여 이후: 10회차 안내·날짜/장소 투표·중간 참여 보기 <ArrowRight size={16} /></Link>
        <p className={s.boundary}>개발 환경에서만 열리는 화면입니다. 실제 계정의 참여 가능 여부나 운영 서버 연결을 증명하는 화면은 아닙니다.</p>
      </main>}
    <AppBottomNav previewPathname={scene==='league'&&chatView?'/chat':'/meetups'}/>
  </div>
}
