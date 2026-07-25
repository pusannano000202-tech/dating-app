import { Zap } from 'lucide-react'

interface BootingLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showSubtitle?: boolean
  subtitle?: string
  className?: string
}

const sizes = {
  sm: {
    mark: 'h-8 w-8 rounded-md',
    icon: 16,
    title: 'text-lg',
    subtitle: 'text-[9px]',
  },
  md: {
    mark: 'h-10 w-10 rounded-md',
    icon: 19,
    title: 'text-2xl',
    subtitle: 'text-[10px]',
  },
  lg: {
    mark: 'h-12 w-12 rounded-md',
    icon: 23,
    title: 'text-3xl',
    subtitle: 'text-[11px]',
  },
} as const

export default function BootingLogo({
  size = 'md',
  showSubtitle = true,
  subtitle = '대학생 연결',
  className = '',
}: BootingLogoProps) {
  const s = sizes[size]

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`${s.mark} booting-mark flex items-center justify-center`}>
        <Zap size={s.icon} strokeWidth={2.7} />
      </div>
      <div>
        <p className={`${s.title} font-black leading-none tracking-normal text-boot-ink`}>
          Quantum
        </p>
        {showSubtitle && (
          <p className={`${s.subtitle} mt-1 font-bold tracking-normal text-boot-muted`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
