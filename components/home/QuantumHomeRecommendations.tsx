import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ChevronRight } from 'lucide-react'

const discovery = [
  { href: '/community/voice', title: '목소리로 먼저 친해져요', label: '보이스 · 응원부터 고민까지', image: '/social-scenes/voice.png', alt: '함께 경기를 보며 응원하는 친구들의 예시 장면' },
  { href: '/community/content', title: '내 취향, 우리 학교 순위', label: '맛집 · MBTI · 장소', image: '/social-scenes/content.png', alt: '음식과 학교 주변 공간을 담은 취향 콘텐츠 이미지' },
  { href: '/community/stories', title: '오늘의 이야기 나누기', label: '게시판 · 학교 친구들의 공감', image: '/social-scenes/posts.png', alt: '카페에서 오늘의 이야기를 기록하는 예시 장면' },
] as const

export default function QuantumHomeRecommendations() {
  return <section aria-labelledby="quantum-home-recommendations">
    <h2 id="quantum-home-recommendations" className="mb-3 text-lg font-black tracking-tight">캠퍼스 플레이북</h2>
    <Link href="/meetups/league" className="group block overflow-hidden rounded-xl border border-[#e8cfc4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b34c3e]">
      <div className="relative aspect-[1.95/1] overflow-hidden bg-[#213427] sm:aspect-[2.45/1]">
        <Image src="/social-scenes/home-playmaker-football.webp" alt="캠퍼스 운동장에서 축구를 즐기는 대학생 친구들의 예시 장면" fill sizes="(min-width:1024px) 540px, 100vw" className="object-cover object-[62%_center]" priority />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/15 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center px-5 text-white sm:px-7">
          <p className="text-[11px] font-bold tracking-widest text-white/85">우리 학과, 한 팀으로</p>
          <p className="mt-2 text-[29px] font-black leading-[1.15] tracking-tight sm:text-4xl">우리 과 이름으로,<br />한 판.</p>
          <p className="mt-3 text-xs font-bold">게임 · 축구</p>
        </div>
        <span className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#292320]"><ArrowRight size={20} aria-hidden="true" /></span>
      </div>
      <span className="flex min-h-12 items-center justify-center gap-2 bg-white/40 px-3 text-sm font-black text-[#a43f32]">학과 대항 둘러보기 <ArrowRight size={18} aria-hidden="true" /></span>
    </Link>
    <div className="mt-3 divide-y divide-[#edddd4]">{discovery.map(item => <Link key={item.href} href={item.href} className="group flex min-h-24 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b34c3e]">
      <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#f0e2d8]"><Image src={item.image} alt={item.alt} fill sizes="96px" className="object-cover" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold tracking-tight">{item.title}</span><span className="mt-1 block text-xs leading-5 text-[#807169]">{item.label}</span></span>
      <ChevronRight size={18} className="shrink-0 text-[#8b6a5a]" aria-hidden="true" />
    </Link>)}</div>
  </section>
}
