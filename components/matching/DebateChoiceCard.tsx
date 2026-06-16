import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'

interface DebateChoiceCardProps {
  label: string
  title: string
  description: string
  imageSrc: string
  selected: boolean
  onSelect: () => void
}

export default function DebateChoiceCard({
  label,
  title,
  description,
  imageSrc,
  selected,
  onSelect,
}: DebateChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'group overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        selected
          ? 'border-boot-primary/65 ring-4 ring-boot-primary/10'
          : 'border-boot-hairline hover:border-boot-primary/30',
      ].join(' ')}
    >
      <div className="relative aspect-square bg-boot-soft">
        <Image
          src={imageSrc}
          alt={title}
          fill
          sizes="(max-width: 640px) 45vw, 180px"
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <span className={[
          'absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black shadow-sm',
          selected ? 'bg-boot-primary text-white' : 'bg-white/90 text-boot-primary',
        ].join(' ')}>
          {label}
        </span>
        {selected && (
          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-boot-primary shadow-sm">
            <CheckCircle2 size={17} />
          </span>
        )}
        <span className={[
          'absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t transition',
          selected ? 'from-boot-primary/35 to-transparent' : 'from-black/18 to-transparent',
        ].join(' ')} />
      </div>
      <div className="px-3 py-3">
        <p className={['text-sm font-black', selected ? 'text-boot-primary' : 'text-boot-ink'].join(' ')}>{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-boot-muted">{description}</p>
      </div>
    </button>
  )
}
