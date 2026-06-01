export type SanjiMood = 'pleading' | 'desperate' | 'crying' | 'collapsed'

// ── 눈 서브컴포넌트 ──────────────────────────────────────────────

function EyeLeft({ mood }: { mood: SanjiMood }) {
  if (mood === 'collapsed') {
    return (
      <g>
        <line x1="37" y1="43" x2="51" y2="57" stroke="#4c1d95" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="51" y1="43" x2="37" y2="57" stroke="#4c1d95" strokeWidth="3.5" strokeLinecap="round" />
      </g>
    )
  }
  if (mood === 'crying') {
    return (
      <g>
        <path d="M 35 46 Q 44 41 53 46" stroke="#4c1d95" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M 38 48 Q 44 53 50 48" stroke="#4c1d95" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* 눈물 줄기 1 */}
        <path d="M 38 50 C 36 59 34 67 38 76" stroke="#93c5fd" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.9" />
        {/* 눈물 줄기 2 */}
        <path d="M 44 51 C 43 59 42 65 45 72" stroke="#bfdbfe" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
      </g>
    )
  }
  if (mood === 'desperate') {
    return (
      <g>
        <circle cx="44" cy="48" r="11" fill="white" />
        <circle cx="44" cy="51" r="8" fill="#1e1b4b" />
        <circle cx="48" cy="47" r="3" fill="white" />
        <circle cx="40" cy="56" r="1.5" fill="white" opacity="0.6" />
        {/* 찡그린 눈썹 */}
        <path d="M 33 33 Q 44 29 55 34" stroke="#78350f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* 눈물방울 */}
        <ellipse cx="37" cy="64" rx="4" ry="5.5" fill="#93c5fd" opacity="0.9" />
        <ellipse cx="38" cy="68" rx="3" ry="3" fill="#bfdbfe" opacity="0.6" />
      </g>
    )
  }
  // pleading — 큰 촉촉한 강아지 눈
  return (
    <g>
      <circle cx="44" cy="48" r="13" fill="white" />
      <circle cx="44" cy="51" r="10" fill="#1e1b4b" />
      {/* 눈 반짝임 */}
      <circle cx="49" cy="46" r="4" fill="white" />
      <circle cx="40" cy="57" r="2" fill="white" opacity="0.6" />
      {/* 눈물 맺힘 */}
      <ellipse cx="36" cy="65" rx="3.5" ry="5" fill="#93c5fd" opacity="0.7" />
    </g>
  )
}

function EyeRight({ mood }: { mood: SanjiMood }) {
  if (mood === 'collapsed') {
    return (
      <g>
        <line x1="69" y1="43" x2="83" y2="57" stroke="#4c1d95" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="83" y1="43" x2="69" y2="57" stroke="#4c1d95" strokeWidth="3.5" strokeLinecap="round" />
      </g>
    )
  }
  if (mood === 'crying') {
    return (
      <g>
        <path d="M 67 46 Q 76 41 85 46" stroke="#4c1d95" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M 70 48 Q 76 53 82 48" stroke="#4c1d95" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 82 50 C 84 59 86 67 82 76" stroke="#93c5fd" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.9" />
        <path d="M 76 51 C 77 59 78 65 75 72" stroke="#bfdbfe" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
      </g>
    )
  }
  if (mood === 'desperate') {
    return (
      <g>
        <circle cx="76" cy="48" r="11" fill="white" />
        <circle cx="76" cy="51" r="8" fill="#1e1b4b" />
        <circle cx="80" cy="47" r="3" fill="white" />
        <circle cx="72" cy="56" r="1.5" fill="white" opacity="0.6" />
        <path d="M 65 34 Q 76 29 87 33" stroke="#78350f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <ellipse cx="83" cy="64" rx="4" ry="5.5" fill="#93c5fd" opacity="0.9" />
        <ellipse cx="82" cy="68" rx="3" ry="3" fill="#bfdbfe" opacity="0.6" />
      </g>
    )
  }
  return (
    <g>
      <circle cx="76" cy="48" r="13" fill="white" />
      <circle cx="76" cy="51" r="10" fill="#1e1b4b" />
      <circle cx="81" cy="46" r="4" fill="white" />
      <circle cx="72" cy="57" r="2" fill="white" opacity="0.6" />
      <ellipse cx="84" cy="65" rx="3.5" ry="5" fill="#93c5fd" opacity="0.7" />
    </g>
  )
}

function Beak({ mood }: { mood: SanjiMood }) {
  if (mood === 'collapsed') {
    // 닫힌 부리 — 무표정
    return (
      <g>
        <polygon points="60,62 53,69 67,69" fill="#f97316" />
        <line x1="53" y1="69" x2="67" y2="69" stroke="#ea580c" strokeWidth="1.5" />
      </g>
    )
  }
  if (mood === 'crying') {
    // 살짝 열린 부리 — 슬픈 표정
    return (
      <g>
        <polygon points="60,60 53,66 67,66" fill="#f97316" />
        <path d="M 53 66 Q 60 72 67 66" fill="#991b1b" opacity="0.65" />
      </g>
    )
  }
  // 크게 열린 부리 — 간청/절박
  return (
    <g>
      {/* 윗 부리 */}
      <polygon points="60,59 52,65 68,65" fill="#f97316" />
      {/* 아랫 부리 */}
      <path d="M 52 65 Q 60 73 68 65" fill="#fb923c" />
      {/* 입 속 */}
      <ellipse cx="60" cy="65" rx="7" ry="4" fill="#991b1b" opacity="0.75" />
    </g>
  )
}

// ── 메인 캐릭터 ──────────────────────────────────────────────────

export default function SanjiCharacter({ mood }: { mood: SanjiMood }) {
  const animClass =
    mood === 'pleading'  ? 'animate-bounce' :
    mood === 'desperate' ? 'animate-wiggle' :
    mood === 'crying'    ? 'animate-sway'   : ''

  return (
    <div className={`flex justify-center select-none ${animClass}`}>
      <svg
        viewBox="0 0 120 158"
        width="140"
        height="160"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="산지니 캐릭터"
      >
        {/* ── 꼬리 깃털 ── */}
        <ellipse cx="49" cy="142" rx="17" ry="8"  fill="#7c3aed" opacity="0.5" transform="rotate(-22 49 142)" />
        <ellipse cx="60" cy="146" rx="22" ry="9"  fill="#8b5cf6" opacity="0.7" />
        <ellipse cx="71" cy="142" rx="17" ry="8"  fill="#6d28d9" opacity="0.5" transform="rotate(22 71 142)" />

        {/* ── 몸통 ── */}
        <ellipse cx="60" cy="113" rx="37" ry="30" fill="#fbbf24" />
        {/* 배 밝은 부분 */}
        <ellipse cx="60" cy="118" rx="22" ry="19" fill="#fde68a" opacity="0.65" />

        {/* ── 날개 ── */}
        <ellipse cx="22" cy="115" rx="14" ry="9"  fill="#d97706" transform="rotate(-28 22 115)" />
        <ellipse cx="98" cy="115" rx="14" ry="9"  fill="#d97706" transform="rotate(28 98 115)" />

        {/* ── 목 ── */}
        <ellipse cx="60" cy="87"  rx="17" ry="12" fill="#fbbf24" />

        {/* ── 머리 ── */}
        <circle cx="60" cy="55" r="32" fill="#fbbf24" />

        {/* ── 머리 크레스트 (부산대 보라색) ── */}
        <ellipse cx="48" cy="25" rx="6"   ry="13" fill="#7c3aed" transform="rotate(-18 48 25)" />
        <ellipse cx="60" cy="22" rx="6"   ry="15" fill="#8b5cf6" />
        <ellipse cx="72" cy="25" rx="6"   ry="13" fill="#6d28d9" transform="rotate(18 72 25)" />
        {/* 크레스트 끝 반짝 */}
        <circle cx="48" cy="13" r="2.5" fill="#c4b5fd" opacity="0.9" />
        <circle cx="60" cy="9"  r="3"   fill="#ddd6fe" opacity="0.9" />
        <circle cx="72" cy="13" r="2.5" fill="#c4b5fd" opacity="0.9" />

        {/* ── 눈 ── */}
        <EyeLeft  mood={mood} />
        <EyeRight mood={mood} />

        {/* ── 부리 & 입 ── */}
        <Beak mood={mood} />

        {/* ── 볼터치 ── */}
        <ellipse cx="31" cy="63" rx="10" ry="6"   fill="#fb7185" opacity="0.28" />
        <ellipse cx="89" cy="63" rx="10" ry="6"   fill="#fb7185" opacity="0.28" />

        {/* ── 무드별 이펙트 ── */}

        {/* pleading: 반짝 별 */}
        {mood === 'pleading' && (
          <>
            <text x="3"   y="40" fontSize="12" opacity="0.85">✨</text>
            <text x="100" y="40" fontSize="12" opacity="0.85">✨</text>
          </>
        )}

        {/* desperate: 식은땀 */}
        {mood === 'desperate' && (
          <path
            d="M 103 26 L 100 36 Q 99 41 103 41 Q 107 41 106 36 Z"
            fill="#93c5fd"
            opacity="0.85"
          />
        )}

        {/* collapsed: 어지러운 별 */}
        {mood === 'collapsed' && (
          <>
            <text x="18" y="26" fontSize="11">💫</text>
            <text x="84" y="26" fontSize="11">💫</text>
          </>
        )}
      </svg>
    </div>
  )
}
