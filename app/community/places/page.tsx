import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import PlaceExperienceExplorer from '@/components/community/PlaceExperienceExplorer'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import s from '@/components/social/social-scenes.module.css'

export default function CommunityPlacesPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community" />
  return <main className={s.page}><div className={s.container}>
    <header className={s.header}><Link className={s.back} href="/community/content"><ArrowLeft size={17}/>우리 학교 취향</Link><span className={s.eyebrow}>장소 월드컵</span></header>
    <h1 className={s.title}>같이 가면,<br/>어디가 제일 좋을까?</h1>
    <p className={s.lead}>놀고 싶은 날도, 운동하고 싶은 날도.</p>
    <PlaceExperienceExplorer />
  </div></main>
}
