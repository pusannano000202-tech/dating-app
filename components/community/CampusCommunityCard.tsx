import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'

type CampusCommunityTone = 'coral' | 'mint' | 'sky' | 'amber' | 'ink'

const toneStyles: Record<CampusCommunityTone, {
  badge: string
  icon: string
  ring: string
}> = {
  coral: {
    badge: 'bg-boot-primary/10 text-boot-primary',
    icon: 'bg-gradient-to-br from-boot-primary to-boot-coral text-white',
    ring: 'border-boot-primary/20',
  },
  mint: {
    badge: 'bg-emerald-50 text-emerald-600',
    icon: 'bg-emerald-100 text-emerald-600',
    ring: 'border-emerald-100',
  },
  sky: {
    badge: 'bg-sky-50 text-sky-600',
    icon: 'bg-sky-100 text-sky-600',
    ring: 'border-sky-100',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-600',
    icon: 'bg-amber-100 text-amber-600',
    ring: 'border-amber-100',
  },
  ink: {
    badge: 'bg-stone-100 text-boot-ink',
    icon: 'bg-boot-ink text-white',
    ring: 'border-boot-hairline',
  },
}

interface CampusCommunityCardProps {
  title: string
  category: string
  description: string
  meta: string
  members: string
  Icon: LucideIcon
  tone?: CampusCommunityTone
}

export function CampusCommunityCard({
  title,
  category,
  description,
  meta,
  members,
  Icon,
  tone = 'coral',
}: CampusCommunityCardProps) {
  const styles = toneStyles[tone]

  return (
    <article className={`rounded-[28px] border ${styles.ring} bg-white px-4 py-4 shadow-[0_18px_42px_rgba(23,20,18,0.07)]`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${styles.badge}`}>
              {category}
            </span>
            <span className="text-[11px] font-bold text-boot-muted">{members}</span>
          </div>
          <h2 className="mt-3 text-xl font-black leading-tight text-boot-ink">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-boot-muted">{description}</p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-boot-soft px-3 py-3">
            <p className="min-w-0 text-xs font-bold leading-5 text-boot-body">{meta}</p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-boot-primary shadow-sm">
              <ChevronRight size={16} />
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
