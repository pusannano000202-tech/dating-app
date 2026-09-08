import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CommunityExperienceExplorer from '@/components/community/CommunityExperienceExplorer'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import { isCampusEatsFeatureEnabled,isCommunityFeatureEnabled } from '@/lib/community-feature'
import s from '@/components/social/social-scenes.module.css'
export default function CommunityContentPage(){
  if(!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community"/>
  return <main className={s.page}><div className={s.container}>
    <header className={s.header}><Link className={s.back} href="/community"><ArrowLeft size={17}/>커뮤니티</Link><span className={s.eyebrow}>우리 학교 취향</span></header>
    <h1 className={s.title}>우리 학교 취향 찾기</h1>
    <p className={s.lead}>옆으로 넘기며, 궁금한 것부터 골라요.</p>
    <CommunityExperienceExplorer campusEatsEnabled={isCampusEatsFeatureEnabled()}/>
  </div></main>
}
