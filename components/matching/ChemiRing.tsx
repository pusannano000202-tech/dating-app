type ChemiRingProps = {
  score?: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

const sizeMap = {
  sm: {
    box: 'h-28 w-28',
    text: 'text-4xl',
    label: 'text-[11px]',
    stroke: 10,
  },
  md: {
    box: 'h-36 w-36',
    text: 'text-5xl',
    label: 'text-xs',
    stroke: 11,
  },
  lg: {
    box: 'h-44 w-44',
    text: 'text-6xl',
    label: 'text-sm',
    stroke: 12,
  },
} as const

export default function ChemiRing({
  score = 70,
  size = 'md',
  label = 'CHEMI',
  className = '',
}: ChemiRingProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))
  const sizing = sizeMap[size]
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedScore / 100)

  return (
    <div className={['relative flex items-center justify-center', sizing.box, className].filter(Boolean).join(' ')}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
        <defs>
          <linearGradient id="booting-chemi-ring" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#FF4F5F" />
            <stop offset="58%" stopColor="#FF7548" />
            <stop offset="100%" stopColor="#FFB06A" />
          </linearGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#EFE8DF"
          strokeWidth={sizing.stroke}
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="url(#booting-chemi-ring)"
          strokeWidth={sizing.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="relative text-center">
        <p className={`${sizing.text} font-black leading-none tracking-normal text-boot-ink`}>{clampedScore}</p>
        <p className={`${sizing.label} mt-2 font-black tracking-[0.16em] text-boot-muted`}>{label}</p>
      </div>
    </div>
  )
}
