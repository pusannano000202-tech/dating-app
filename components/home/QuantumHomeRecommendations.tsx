import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, MapPinned, UsersRound } from 'lucide-react'

const recommendations = [
  {
    href: '/community/campus-eats?mode=battle&category=donkatsu',
    eyebrow: '이번 주',
    title: '부산대 돈까스 8강',
    description: '가본 곳끼리 비교하면 내 대진이 바로 이어져요.',
    image: '/campus-eats/preview/cutlet-katsu.webp',
    imageAlt: '시안용 돈까스 한 접시',
    Icon: MapPinned,
    action: '바로 대결 시작',
    priority: true,
  },
  {
    href: '/meetups?focus=featured',
    eyebrow: '오늘 저녁',
    title: '부담 적은 모임부터',
    description: '지금 참여하기 좋은 학교 앞 모임을 먼저 보여드려요.',
    image: '/images/quantum-campus-group.webp',
    imageAlt: '캠퍼스 라운지에서 대화하는 대학생 네 명',
    Icon: UsersRound,
    action: '추천 모임 보기',
    priority: false,
  },
] as const

export default function QuantumHomeRecommendations() {
  return (
    <section aria-labelledby="quantum-home-recommendations">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black text-boot-primary">QUANTUM PICK</p>
          <h2 id="quantum-home-recommendations" className="mt-1 text-xl font-black">지금 해볼 것</h2>
        </div>
        <p className="text-xs font-bold text-boot-muted">두 가지만 골랐어요</p>
      </div>

      <div className="grid gap-3">
        {recommendations.map(({ href, eyebrow, title, description, image, imageAlt, Icon, action, priority }) => (
          <Link
            key={href}
            href={href}
            className="group grid min-h-[132px] grid-cols-[124px_minmax(0,1fr)] overflow-hidden rounded-lg border border-boot-hairline bg-white transition-colors duration-200 hover:border-boot-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-primary"
          >
            <span className="relative min-h-[132px] overflow-hidden bg-boot-soft">
              <Image
                src={image}
                alt={imageAlt}
                fill
                sizes="124px"
                className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                priority={priority}
              />
            </span>
            <span className="flex min-w-0 flex-col justify-center px-4 py-3">
              <span className="flex items-center gap-1.5 text-[11px] font-black text-boot-coral">
                <Icon size={14} />{eyebrow}
              </span>
              <span className="mt-1 block text-lg font-black leading-6">{title}</span>
              <span className="mt-1 block text-xs font-bold leading-5 text-boot-muted">{description}</span>
              <span className="mt-2 flex items-center gap-1 text-xs font-black text-boot-primary">
                {action}<ArrowRight size={14} />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
