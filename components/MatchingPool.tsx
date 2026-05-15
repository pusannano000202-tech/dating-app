'use client'

import { useEffect, useState } from 'react'

interface PoolStats {
  female: number
  male: number
}

interface OrbConfig {
  gender: 'female' | 'male'
  x: number
  y: number
  size: number
  animName: string      // keyframe name
  animDelay: string
  animDuration: string
  encounterDelay: string
}

const ORBS: OrbConfig[] = [
  // 여자 오브 — 로즈핑크
  { gender: 'female', x: -45, y: -30, size: 28, animName: 'orb-float-1', animDelay: '0s',   animDuration: '12s', encounterDelay: '3s'  },
  { gender: 'female', x:  30, y: -55, size: 22, animName: 'orb-float-3', animDelay: '1.5s', animDuration: '10s', encounterDelay: '8s'  },
  { gender: 'female', x: -20, y:  45, size: 26, animName: 'orb-float-5', animDelay: '3s',   animDuration: '11s', encounterDelay: '14s' },
  { gender: 'female', x:  55, y:  20, size: 20, animName: 'orb-float-2', animDelay: '5s',   animDuration: '15s', encounterDelay: '1s'  },
  { gender: 'female', x: -60, y:  10, size: 24, animName: 'orb-float-4', animDelay: '7s',   animDuration: '14s', encounterDelay: '11s' },
  { gender: 'male',   x:  40, y: -25, size: 26, animName: 'orb-float-2', animDelay: '0.8s', animDuration: '13s', encounterDelay: '5s'  },
  { gender: 'male',   x: -35, y:  55, size: 22, animName: 'orb-float-4', animDelay: '2.5s', animDuration: '11s', encounterDelay: '9s'  },
  { gender: 'male',   x:  20, y:  50, size: 28, animName: 'orb-float-1', animDelay: '4s',   animDuration: '12s', encounterDelay: '16s' },
  { gender: 'male',   x: -55, y: -40, size: 20, animName: 'orb-float-3', animDelay: '6s',   animDuration: '10s', encounterDelay: '2s'  },
  { gender: 'male',   x:  60, y: -50, size: 24, animName: 'orb-float-5', animDelay: '8.5s', animDuration: '14s', encounterDelay: '12s' },
]

function SoulOrb({ orb }: { orb: OrbConfig }) {
  const isFemale = orb.gender === 'female'

  const baseColor  = isFemale ? '#f472b6' : '#a78bfa'
  const glowColor  = isFemale ? 'rgba(244,114,182,0.6)' : 'rgba(167,139,250,0.6)'
  const coreColor  = isFemale ? 'rgba(251,191,196,0.9)' : 'rgba(196,181,253,0.9)'

  return (
    <div
      className="absolute"
      style={{
        left:             `calc(50% + ${orb.x}%)`,
        top:              `calc(50% + ${orb.y}%)`,
        transform:        'translate(-50%, -50%)',
        animation:        `${orb.animName} ${orb.animDuration} ease-in-out infinite`,
        animationDelay:   orb.animDelay,
      }}
    >
      {/* 만남 효과 — 주기적 white flash */}
      <div
        className="absolute inset-0 rounded-full animate-orb-pulse"
        style={{
          animationDelay: orb.encounterDelay,
          animationDuration: '6s',
          background: `radial-gradient(circle, white 0%, ${glowColor} 60%, transparent 100%)`,
          width: orb.size * 2.5,
          height: orb.size * 2.5,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      {/* aura glow */}
      <div
        className="absolute rounded-full"
        style={{
          width:  orb.size * 2.2,
          height: orb.size * 2.2,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          filter: 'blur(8px)',
          animation: `orb-pulse ${3 + Math.random()}s ease-in-out infinite`,
          animationDelay: orb.animDelay,
        }}
      />
      {/* 오브 본체 */}
      <div
        style={{
          width:  orb.size,
          height: orb.size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${coreColor}, ${baseColor})`,
          boxShadow: `0 0 ${orb.size}px ${glowColor}, 0 0 ${orb.size * 0.5}px white`,
          filter: 'blur(0.5px)',
        }}
      />
    </div>
  )
}

interface Props {
  stats?: PoolStats
  className?: string
}

export default function MatchingPool({ stats, className = '' }: Props) {
  const [displayed, setDisplayed] = useState({ female: 0, male: 0 })
  const target = stats ?? { female: 38, male: 47 }   // 더미 기본값

  /* 카운트업 애니메이션 */
  useEffect(() => {
    const duration = 1200
    const steps    = 40
    const interval = duration / steps
    let step = 0
    const timer = setInterval(() => {
      step++
      const progress = step / steps
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplayed({
        female: Math.round(target.female * ease),
        male:   Math.round(target.male   * ease),
      })
      if (step >= steps) clearInterval(timer)
    }, interval)
    return () => clearInterval(timer)
  }, [target.female, target.male])

  const total = target.female + target.male

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* 타이틀 */}
      <p className="text-xs text-gray-500 tracking-widest uppercase mb-3 font-medium">
        지금 운명을 기다리는 중
      </p>

      {/* ── 오브 필드 ── */}
      <div className="relative" style={{ width: 280, height: 280 }}>
        {/* 외부 링 — glow border */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'transparent',
            border: '1.5px solid',
            borderColor: 'rgba(167,139,250,0.25)',
            boxShadow: '0 0 40px rgba(124,58,237,0.12), inset 0 0 40px rgba(190,24,93,0.06)',
          }}
        />
        {/* 동심원 2 */}
        <div
          className="absolute rounded-full"
          style={{
            inset: '15%',
            border: '1px solid rgba(244,114,182,0.12)',
          }}
        />
        {/* 동심원 3 */}
        <div
          className="absolute rounded-full"
          style={{
            inset: '35%',
            border: '1px solid rgba(167,139,250,0.10)',
          }}
        />

        {/* 레이더 스캔 라인 */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ animation: 'radar-sweep 10s linear infinite' }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: '50%', height: '1px',
              transformOrigin: '0% 50%',
              background: 'linear-gradient(to right, transparent, rgba(167,139,250,0.4))',
            }}
          />
        </div>

        {/* 오브들 */}
        {ORBS.map((orb, i) => (
          <SoulOrb key={i} orb={orb} />
        ))}

        {/* 중심 — 펄스 링 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full"
            style={{
              width: 8, height: 8,
              background: 'white',
              boxShadow: '0 0 12px rgba(255,255,255,0.8)',
              animation: 'ring-expand 3s ease-out infinite',
            }}
          />
        </div>
      </div>

      {/* ── 카운터 ── */}
      <div className="flex items-center gap-6 mt-5">
        {/* 여자 */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: 'radial-gradient(circle, #fce7f3, #f472b6)',
                boxShadow: '0 0 8px rgba(244,114,182,0.7)',
              }}
            />
            <span className="text-xs text-gray-400">여자</span>
          </div>
          <span
            className="text-2xl font-black"
            style={{ color: '#f472b6', textShadow: '0 0 16px rgba(244,114,182,0.5)' }}
          >
            {displayed.female}
          </span>
          <span className="text-[10px] text-gray-600">명 대기 중</span>
        </div>

        {/* 구분 + 총계 */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-lg font-black text-white">{total}</span>
          <span className="text-[10px] text-gray-500">총 인원</span>
        </div>

        {/* 남자 */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: 'radial-gradient(circle, #ede9fe, #a78bfa)',
                boxShadow: '0 0 8px rgba(167,139,250,0.7)',
              }}
            />
            <span className="text-xs text-gray-400">남자</span>
          </div>
          <span
            className="text-2xl font-black"
            style={{ color: '#a78bfa', textShadow: '0 0 16px rgba(167,139,250,0.5)' }}
          >
            {displayed.male}
          </span>
          <span className="text-[10px] text-gray-600">명 대기 중</span>
        </div>
      </div>

      {/* 실시간 뱃지 */}
      <div className="flex items-center gap-1.5 mt-3">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: 'orb-pulse 2s ease-in-out infinite' }} />
        <span className="text-[10px] text-gray-500">실시간 업데이트</span>
      </div>
    </div>
  )
}
