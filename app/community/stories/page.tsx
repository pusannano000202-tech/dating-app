import Link from 'next/link'
import { ArrowLeft,ArrowRight } from 'lucide-react'
import { communityCategoryCatalog } from '@/lib/community/catalog'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import s from '@/components/social/social-scenes.module.css'
export default function CommunityStoriesPage(){
  if(!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community"/>
  return <main className={s.page}><div className={s.container}>
    <header className={s.header}><Link href="/community" className={s.back}><ArrowLeft size={17}/>커뮤니티</Link><span className={s.eyebrow}>학교 이야기</span></header>
    <h1 className={s.title}>오늘은 무슨 일이<br/>있었나요?</h1><p className={s.lead}>학교 사람들과 공감하고, 궁금한 이야기를 나눠요.</p>
    <Link className={s.primary} href="/community/hot">지금 공감받는 이야기<ArrowRight size={17}/></Link>
    <nav className={s.storyGrid} aria-label="게시판 선택">{communityCategoryCatalog.filter(c=>c.id!=='campus-eats').map(c=><Link className={s.storyLink} key={c.id} href={c.href}><strong>{c.title}</strong><span>이야기 읽고 글 쓰기</span><ArrowRight size={17}/></Link>)}</nav>
  </div></main>
}
