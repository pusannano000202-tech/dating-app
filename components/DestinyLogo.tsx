interface Props {
  size?: number
  className?: string
}

/*
 * Destiny 로고 — Manus 디자인 기반
 * 두 궤도 링이 교차해 나비/하트 실루엣을 이루고
 * 중심에 운명의 4포인트 별이 빛나는 형태
 */
export default function DestinyLogo({ size = 48, className = '' }: Props) {
  const id = `dl-${size}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* 로즈골드 → 바이올렛 */}
        <linearGradient id={`${id}-orbit`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#f9a8d4" />
          <stop offset="40%"  stopColor="#e879f9" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        {/* 별 그라디언트 — 중심 밝게 */}
        <linearGradient id={`${id}-star`} x1="35" y1="35" x2="65" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#fde68a" />
          <stop offset="50%"  stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
        {/* 중심 glow */}
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="50%"  stopColor="#f59e0b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#be185d" stopOpacity="0" />
        </radialGradient>
        {/* 블러 필터 */}
        <filter id={`${id}-blur-sm`}>
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        <filter id={`${id}-blur-glow`}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* ── 궤도 glow 레이어 (블러) ── */}
      <ellipse
        cx="50" cy="50" rx="38" ry="15"
        stroke={`url(#${id}-orbit)`} strokeWidth="3.5" fill="none"
        transform="rotate(-38 50 50)"
        filter={`url(#${id}-blur-sm)`} opacity="0.5"
      />
      <ellipse
        cx="50" cy="50" rx="38" ry="15"
        stroke={`url(#${id}-orbit)`} strokeWidth="3.5" fill="none"
        transform="rotate(38 50 50)"
        filter={`url(#${id}-blur-sm)`} opacity="0.5"
      />

      {/* ── 궤도 링 본체 ── */}
      <ellipse
        cx="50" cy="50" rx="38" ry="15"
        stroke={`url(#${id}-orbit)`} strokeWidth="2" fill="none"
        transform="rotate(-38 50 50)"
        strokeLinecap="round"
      />
      <ellipse
        cx="50" cy="50" rx="38" ry="15"
        stroke={`url(#${id}-orbit)`} strokeWidth="2" fill="none"
        transform="rotate(38 50 50)"
        strokeLinecap="round"
      />

      {/* ── 궤도 끝점 작은 구슬 ── */}
      {/* 왼쪽 끝 */}
      <circle cx="12" cy="50" r="3" fill={`url(#${id}-orbit)`} opacity="0.9" />
      {/* 오른쪽 끝 */}
      <circle cx="88" cy="50" r="3" fill={`url(#${id}-orbit)`} opacity="0.9" />
      {/* 위 끝 */}
      <circle cx="50" cy="13" r="2.5" fill={`url(#${id}-orbit)`} opacity="0.7" />
      {/* 아래 끝 */}
      <circle cx="50" cy="87" r="2.5" fill={`url(#${id}-orbit)`} opacity="0.7" />

      {/* ── 중심 glow ── */}
      <circle cx="50" cy="50" r="12" fill={`url(#${id}-glow)`} filter={`url(#${id}-blur-glow)`} />

      {/* ── 4포인트 별 (운명의 별) ── */}
      {/* 별 glow */}
      <path
        d="M50 33 L52.5 47.5 L67 50 L52.5 52.5 L50 67 L47.5 52.5 L33 50 L47.5 47.5 Z"
        fill={`url(#${id}-star)`}
        filter={`url(#${id}-blur-sm)`}
        opacity="0.6"
      />
      {/* 별 본체 */}
      <path
        d="M50 35 L52.2 47.8 L65 50 L52.2 52.2 L50 65 L47.8 52.2 L35 50 L47.8 47.8 Z"
        fill={`url(#${id}-star)`}
      />

      {/* ── 중심 백색 코어 ── */}
      <circle cx="50" cy="50" r="3.5" fill="white" opacity="0.95" />
      <circle cx="50" cy="50" r="5.5" fill="white" opacity="0.15" />
    </svg>
  )
}
