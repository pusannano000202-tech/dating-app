import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import PlaceExperienceExplorer from '@/components/community/PlaceExperienceExplorer'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { placeCategory } from '@/lib/place-worldcup/contract'
import s from '@/components/social/social-scenes.module.css'

export default async function CommunityPlacesPage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community" />
  const query = await searchParams
  let initialCategory = placeCategory('pc')
  try { initialCategory = placeCategory(Array.isArray(query.category) ? query.category[0] : query.category) } catch { /* default */ }
  return <main className={s.page}><div className={s.container}>
    <header className={s.header}><Link className={s.back} href="/community/content"><ArrowLeft size={17}/>우리 학교 취향</Link><span className={s.eyebrow}>장소 월드컵</span></header>
    <h1 className={s.title}>같이 가면,<br/>어디가 제일 좋을까?</h1>
    <p className={s.lead}>놀고 싶은 날도, 운동하고 싶은 날도.</p>
    <PlaceExperienceExplorer initialCategory={initialCategory}/>
  </div></main>
}
