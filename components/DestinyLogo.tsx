interface Props {
  size?: number
  className?: string
}

/* Destiny 앱 로고 아이콘 — 두 궤도가 교차하는 순간, 운명의 별 */
export default function DestinyLogo({ size = 48, className = '' }: Props) {
  const id = 'dl'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* 메인 그라디언트: 보라 → 로즈 → 앰버 */}
        <linearGradient id={`${id}-g1`} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="45%"  stopColor="#f472b6" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        {/* 링 그라디언트 */}
        <linearGradient id={`${id}-g2`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#be185d" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={`${id}-g3`} x1="48" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#be185d" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#d97706" stopOpacity="0.5" />
        </linearGradient>
        {/* 중심 glow */}
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#fde68a" stopOpacity="1" />
          <stop offset="60%"  stopColor="#fbbf24" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>

      {/* ── 두 궤도 링: "두 사람의 길이 교차하다" ── */}
      {/* 왼쪽 기울기 타원 */}
      <ellipse
        cx="24" cy="24" rx="17" ry="8"
        stroke={`url(#${id}-g2)`}
        strokeWidth="1.8"
        fill="none"
        transform="rotate(-38 24 24)"
        strokeLinecap="round"
      />
      {/* 오른쪽 기울기 타원 */}
      <ellipse
        cx="24" cy="24" rx="17" ry="8"
        stroke={`url(#${id}-g3)`}
        strokeWidth="1.8"
        fill="none"
        transform="rotate(38 24 24)"
        strokeLinecap="round"
      />

      {/* ── 4-포인트 별: 운명의 별 ── */}
      {/* 별 glow (블러) */}
      <path
        d="M24 9 L26.2 21.8 L39 24 L26.2 26.2 L24 39 L21.8 26.2 L9 24 L21.8 21.8 Z"
        fill={`url(#${id}-g1)`}
        filter={`url(#${id}-blur)`}
        opacity="0.55"
      />
      {/* 별 본체 */}
      <path
        d="M24 10 L25.8 22.2 L38 24 L25.8 25.8 L24 38 L22.2 25.8 L10 24 L22.2 22.2 Z"
        fill={`url(#${id}-g1)`}
      />

      {/* ── 중심점: 만남의 순간 ── */}
      {/* 큰 glow */}
      <circle cx="24" cy="24" r="5" fill={`url(#${id}-glow)`} opacity="0.5" />
      {/* 선명한 중심 */}
      <circle cx="24" cy="24" r="2.4" fill="white" opacity="0.95" />
    </svg>
  )
}
