import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import s from '@/components/social/social-scenes.module.css'

const entries = [
  { id:'content', label:'콘텐츠', title:'우리 학교\n취향 찾기', detail:'맛집 · MBTI · 장소', action:'취향 찾아보기', image:'/social-scenes/content.png', alt:'파스타와 음료가 놓인 테이블의 연출 사진', href:'/community/content' },
  { id:'stories', label:'게시글', title:'오늘의 이야기\n나누기', detail:'공강 한 시간, 다들 뭐 해요?', action:'이야기 보러 가기', image:'/social-scenes/posts.png', alt:'카페에서 휴대전화로 소통하는 연출 사진', href:'/community/stories' },
  { id:'voice', label:'보이스', title:'같이 응원하고\n고민 나눠요', detail:'LCK · 야구 · 연애 · 취업', action:'목소리로 모이기', image:'/social-scenes/voice.png', alt:'경기를 보며 함께 응원하는 관중의 연출 사진', href:'/community/voice' },
] as const
export default function CommunityPortal() {
  return <main className={s.page}><div className={s.portal}>
    <header className={s.portalHeader}><p className={s.eyebrow}>Quantum</p><h1>부산대, 우리끼리</h1><p>같은 캠퍼스, 더 가까운 우리</p></header>
    <nav className={s.portalRows} aria-label="커뮤니티 세 가지 입구">
      {entries.map(entry=><Link key={entry.id} href={entry.href} className={s.portalRow}>
        <Image className={s.portalPhoto} src={entry.image} alt={entry.alt} width={720} height={480} sizes="(min-width: 700px) 290px, 44vw"/>
        <div className={s.portalText}><span className={s.eyebrow}>{entry.label}</span><h2>{entry.title}</h2><p>{entry.detail}</p><span className={s.portalAction}>{entry.action}<ArrowRight size={15}/></span></div>
      </Link>)}
    </nav>
  </div></main>
}
