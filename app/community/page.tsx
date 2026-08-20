import Link from 'next/link'
import { ChefHat, Flame } from 'lucide-react'

import BootingLogo from '@/components/BootingLogo'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import CommunitySpotlight from '@/components/community/CommunitySpotlight'
import { communityCategoryCatalog } from '@/lib/community/catalog'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function CommunityPage() {
  if (!isCommunityFeatureEnabled()) {
    return <CommunityComingSoon kind="community" />
  }

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6 sm:pt-7">
        <header className="flex items-center justify-between border-b border-boot-hairline pb-4">
          <div>
            <BootingLogo size="md" />
            <h1 className="mt-3 text-2xl font-black sm:text-3xl">Campus 커뮤니티를 시작해요.</h1>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-boot-muted">
              고민, 제안, 후기, 맛집 이야기를 목적별로 빠르게 이동해보세요.
            </p>
          </div>
        </header>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6" aria-label="커뮤니티 메뉴 이동">
          <Link href="/community/hot" className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] bg-boot-ink px-3 text-xs font-black text-white">
            <Flame size={15} /> 핫피드
          </Link>
          <Link
            href="/community/campus-eats?mode=battle&category=donkatsu"
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] bg-[#F6BD57] px-3 text-xs font-black text-[#18120D]"
          >
            <ChefHat size={15} /> 맛집 월드컵 NEW
          </Link>
          {communityCategoryCatalog.filter((entry) => entry.id !== 'campus-eats').map((entry) => (
            <Link key={entry.id} href={entry.href} className="flex min-h-11 shrink-0 items-center rounded-[8px] border border-boot-hairline bg-white px-3 text-xs font-black text-boot-muted">
              {entry.title}
            </Link>
          ))}
        </nav>

        <CommunitySpotlight />
      </div>
    </main>
  )
}
