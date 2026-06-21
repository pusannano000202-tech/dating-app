'use client'

import { memo, useEffect, useState } from 'react'
import Link from 'next/link'

type QueueStats = {
  male: number
  female: number
  myGroupSize: number
  myGroupInQueue: boolean
}

type Point = {
  x: number
  y: number
  radius: number
  opacity: number
  accented?: boolean
  flowTarget?: {
    x: number
    y: number
  }
}

type GrooveAnchor = {
  start: { x: number; y: number }
  control: { x: number; y: number }
  end: { x: number; y: number }
}

type QueueRadarCardProps = {
  stats: QueueStats
  saving: boolean
  canCancel: boolean
  onCancel: () => void
  homeHref?: string
  resultHref?: string
}

const PANEL_SIZE = 320
const CENTER = { x: PANEL_SIZE / 2, y: PANEL_SIZE / 2 }
const MAX_ANIMATED_FLOW_DOTS = 28

const MALE_GROOVES: GrooveAnchor[] = [
  { start: { x: -126, y: -86 }, control: { x: -66, y: -118 }, end: { x: -10, y: -12 } },
  { start: { x: -124, y: -34 }, control: { x: -72, y: -62 }, end: { x: -6, y: 42 } },
  { start: { x: -118, y: 20 }, control: { x: -54, y: 2 }, end: { x: -4, y: 96 } },
  { start: { x: -132, y: 74 }, control: { x: -58, y: 50 }, end: { x: -10, y: 128 } },
  { start: { x: -138, y: -120 }, control: { x: -52, y: -88 }, end: { x: -8, y: 2 } },
]

const FEMALE_GROOVES: GrooveAnchor[] = [
  { start: { x: 126, y: -86 }, control: { x: 66, y: -118 }, end: { x: 10, y: -12 } },
  { start: { x: 124, y: -34 }, control: { x: 72, y: -62 }, end: { x: 6, y: 42 } },
  { start: { x: 118, y: 20 }, control: { x: 54, y: 2 }, end: { x: 4, y: 96 } },
  { start: { x: 132, y: 74 }, control: { x: 58, y: 50 }, end: { x: 10, y: 128 } },
  { start: { x: 138, y: -120 }, control: { x: 52, y: -88 }, end: { x: 8, y: 2 } },
]

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function quadraticPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
) {
  const nt = clamp(t, 0, 1)
  const a = nt * nt
  const b = 2 * nt * (1 - nt)
  const c = (1 - nt) * (1 - nt)
  return {
    x: c * start.x + b * control.x + a * end.x,
    y: c * start.y + b * control.y + a * end.y,
  }
}

function drawGroovePath(anchors: GrooveAnchor[]) {
  return anchors
    .map((anchor) => `M ${CENTER.x + anchor.start.x} ${CENTER.y + anchor.start.y} Q ${CENTER.x + anchor.control.x} ${CENTER.y + anchor.control.y} ${CENTER.x + anchor.end.x} ${CENTER.y + anchor.end.y}`)
    .join(' ')
}

function buildDensityScale(total: number) {
  const safe = Math.max(1, total)
  const damp = 1 - Math.min(0.6, Math.log2(safe + 1) * 0.09)
  return clamp(damp, 0.46, 1)
}

function buildGrooveDots(total: number, anchors: GrooveAnchor[], inQueue: boolean): Point[] {
  const safe = Math.max(0, Math.trunc(total))
  if (safe === 0) return []

  const laneCount = anchors.length
  const maxInLane = Math.max(1, Math.ceil(safe / laneCount))
  const sizeScale = buildDensityScale(safe)
  const baseRadius = clamp(3.5 * sizeScale, 1.3, 3.5)
  const floatRange = 2.5 + (1 - sizeScale) * 2

  return Array.from({ length: safe }, (_, index) => {
    const lane = index % laneCount
    const rank = Math.floor(index / laneCount)
    const laneAnchor = anchors[lane]
    const t = clamp((rank + 1 + (lane % 2) * 0.12) / (maxInLane + 1.2), 0, 1)
    const base = quadraticPoint(
      laneAnchor.start,
      laneAnchor.control,
      laneAnchor.end,
      t,
    )

    const seedA = (index * 17 + 9) % 19
    const seedB = (index * 29 + 7) % 23
    const floatX = Math.sin(seedA) * floatRange
    const floatY = Math.cos(seedB) * (floatRange * 0.75)
    const x = CENTER.x + base.x + floatX
    const y = CENTER.y + base.y + floatY

    const isFlow = inQueue && (index % 4 === 0)
    const centerPull = isFlow
      ? 0.2 + ((seedA % 6) / 18)
      : 0
    const flowTarget = isFlow
      ? {
          x: x - (x - CENTER.x) * centerPull,
          y: y - (y - CENTER.y) * centerPull,
        }
      : undefined

    return {
      x,
      y,
      radius: baseRadius * (1 - t * 0.38),
      opacity: clamp(0.9 - t * 0.37, 0.32, 0.9),
      accented: index % 4 === 0 && index < MAX_ANIMATED_FLOW_DOTS,
      flowTarget,
    }
  })
}

function buildMyGroupPoints(size: number) {
  const safe = Math.max(0, Math.trunc(size))
  if (safe === 0) return []

  const pointRadius = safe > 6 ? 3.9 : 4.2
  const orbit = clamp(12 + safe, 8, 24)

  return Array.from({ length: safe }, (_, index) => {
    const progress = safe === 1 ? 0 : (index / Math.max(1, safe - 1)) * Math.PI * 2
    const orbitPulse = 2 * Math.sin(index * 1.1 + safe * 0.2)
    const x = CENTER.x + Math.cos(progress + 0.1) * (orbit + orbitPulse * 0.4)
    const y = CENTER.y + Math.sin(progress + 0.1) * (orbit * 0.52 + orbitPulse * 0.26)

    return {
      x,
      y,
      radius: pointRadius,
      opacity: 1,
      accented: index === 0,
    }
  })
}

function QueueRadarCardInner({
  stats,
  saving,
  canCancel,
  onCancel,
  homeHref = '/',
  resultHref = '/match',
}: QueueRadarCardProps) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)

    return () => media.removeEventListener('change', update)
  }, [])

  const maleDots = buildGrooveDots(stats.male, MALE_GROOVES, stats.myGroupInQueue)
  const femaleDots = buildGrooveDots(stats.female, FEMALE_GROOVES, stats.myGroupInQueue)
  const myGroupDots = buildMyGroupPoints(stats.myGroupSize)

  const grooveLines = drawGroovePath(MALE_GROOVES.concat(FEMALE_GROOVES))

  const handleCancel = () => {
    if (!canCancel || saving) return
    if (!window.confirm('매칭 큐에서 빠져나가시겠어요?')) return
    onCancel()
  }

  return (
    <section className="glass rounded-3xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-full border border-boot-primary/40 bg-boot-soft px-3 py-1 text-[11px] font-black tracking-wide text-boot-primary">
          탐색 중
        </span>
        <span className="text-[11px] text-boot-muted">{stats.myGroupInQueue ? '매칭 큐 진입 완료' : '매칭 준비'}</span>
      </div>

      <h2 className="text-sm font-black text-boot-ink">매칭 큐 진입 완료</h2>
      <p className="mt-1 text-xs text-boot-muted">토요일 14:00 결과 공개</p>

      <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-[24px] border border-boot-hairline/80 bg-[#081224]">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.09), rgba(8,18,36,0.98) 62%), radial-gradient(circle at 50% 50%, rgba(125,211,252,0.08), rgba(249,168,212,0.05) 35%, transparent 57%)',
          }}
        />

        <div
          className="pointer-events-none absolute inset-0 rounded-[24px]"
          style={{
            background:
              'conic-gradient(from 45deg, rgba(255,255,255,0) 0deg, rgba(148,163,184,0.12) 9deg, rgba(255,255,255,0) 24deg, rgba(255,255,255,0) 360deg)',
            animation: reducedMotion ? undefined : 'radarSweep 36s linear infinite',
            opacity: 0.16,
            mixBlendMode: 'screen',
          }}
        />

        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: 10 }).map((_, index) => {
            const delay = index * 0.5
            return (
              <div
                key={`ring-${index}`}
                className="absolute rounded-full border border-cyan-100/15"
                style={{
                  inset: `${14 + index * 8}%`,
                  transform: `rotate(${index * 4}deg)`,
                  transition: 'transform 2.4s ease-out',
                  animation: reducedMotion ? undefined : `hydrateWave 24s linear infinite`,
                  animationDelay: `${delay}s`,
                  opacity: 0.09,
                }}
              />
            )
          })}
        </div>

        <div
          className="absolute inset-[10%] rounded-full border border-white/10 motion-reduce:animate-none"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08), rgba(255,255,255,0) 72%)',
          }}
        />

        <div
          className="absolute inset-[20%] rounded-full border border-white/5"
          style={{
            background:
              'conic-gradient(from 110deg, rgba(125,211,252,0.05) 0deg, rgba(248,113,113,0.05) 90deg, rgba(14,23,48,0) 190deg, rgba(14,23,48,0) 360deg)',
            opacity: 0.8,
            animation: reducedMotion ? 'none' : 'spinWave 26s linear infinite',
          }}
        />

        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${PANEL_SIZE} ${PANEL_SIZE}`} fill="none">
          <defs>
            <radialGradient id="maleGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(147,197,253,0.95)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.16)" />
            </radialGradient>
            <radialGradient id="femaleGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(252,165,165,0.95)" />
              <stop offset="100%" stopColor="rgba(244,114,182,0.18)" />
            </radialGradient>
            <linearGradient id="grooveTrace" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(148,163,184,0.18)" />
              <stop offset="100%" stopColor="rgba(148,163,184,0.02)" />
            </linearGradient>
            <filter id="dropletGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="2.5" result="soft" />
              <feMerge>
                <feMergeNode in="soft" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path d={grooveLines} stroke="url(#grooveTrace)" strokeWidth="3.2" fill="none" strokeLinejoin="round" />

          {Array.from({ length: 11 }).map((_, index) => {
            const isOffset = index % 2 === 0
            const y = 32 + index * 25 + (isOffset ? 9 : -6)
            return (
              <path
                key={`crest-${index}`}
                d={`M ${Math.round(y)} ${Math.round(CENTER.y + (index % 2 ? 3 : -3))} Q ${CENTER.x} ${Math.round(
                  16 + index * 11,
                )} ${Math.round(PANEL_SIZE - y)} ${Math.round(CENTER.y - (index % 2 ? 3 : -3))}`}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
                fill="none"
              />
            )
          })}

          {maleDots.map((dot, index) => {
            const animateIn = dot.flowTarget && stats.myGroupInQueue && dot.accented && !reducedMotion
            const duration = 2.9 + (index % 5) * 0.22
            return (
              <circle
                key={`male-${index}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.radius}
                fill="url(#maleGradient)"
                opacity={dot.opacity}
                filter="url(#dropletGlow)"
              >
                {animateIn ? (
                  <>
                    <animate
                      attributeName="cx"
                      dur={`${duration}s`}
                      values={`${dot.x};${dot.flowTarget?.x ?? dot.x};${dot.x}`}
                      repeatCount="indefinite"
                      begin={`${(index * 0.17) % 6}s`}
                    />
                    <animate
                      attributeName="cy"
                      dur={`${duration}s`}
                      values={`${dot.y};${dot.flowTarget?.y ?? dot.y};${dot.y}`}
                      repeatCount="indefinite"
                      begin={`${(index * 0.21) % 6}s`}
                    />
                    <animate
                      attributeName="r"
                      dur={`${1.5 + (index % 4) * 0.12}s`}
                      values={`${dot.radius};${Math.max(dot.radius * 0.92, 1.2)};${dot.radius}`}
                      repeatCount="indefinite"
                      begin={`${(index * 0.16) % 5.6}s`}
                    />
                  </>
                ) : null}
              </circle>
            )
          })}

          {femaleDots.map((dot, index) => {
            const animateIn = dot.flowTarget && stats.myGroupInQueue && dot.accented && !reducedMotion
            const duration = 2.9 + (index % 5) * 0.22
            return (
              <circle
                key={`female-${index}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.radius}
                fill="url(#femaleGradient)"
                opacity={dot.opacity}
                filter="url(#dropletGlow)"
              >
                {animateIn ? (
                  <>
                    <animate
                      attributeName="cx"
                      dur={`${duration}s`}
                      values={`${dot.x};${dot.flowTarget?.x ?? dot.x};${dot.x}`}
                      repeatCount="indefinite"
                      begin={`${(index * 0.15) % 6.2}s`}
                    />
                    <animate
                      attributeName="cy"
                      dur={`${duration}s`}
                      values={`${dot.y};${dot.flowTarget?.y ?? dot.y};${dot.y}`}
                      repeatCount="indefinite"
                      begin={`${(index * 0.13) % 5.9}s`}
                    />
                    <animate
                      attributeName="r"
                      dur={`${1.4 + (index % 5) * 0.14}s`}
                      values={`${dot.radius};${Math.max(dot.radius * 0.9, 1.2)};${dot.radius}`}
                      repeatCount="indefinite"
                      begin={`${(index * 0.17) % 6.4}s`}
                    />
                  </>
                ) : null}
              </circle>
            )
          })}

          <g>
            <circle cx={CENTER.x} cy={CENTER.y} r="5.2" fill="none" stroke="rgba(244,114,182,0.9)" strokeWidth="1.9" />
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r="2.7"
              fill="rgba(255,255,255,0.95)"
              stroke="rgba(244,114,182,0.95)"
              strokeWidth="1.5"
            />
          </g>

          {myGroupDots.map((dot, index) => (
            <circle
              key={`my-group-${index}`}
              cx={dot.x}
              cy={dot.y}
              r={dot.radius}
              fill={dot.accented ? '#ffffff' : 'rgba(255,255,255,0.92)'}
              opacity={dot.opacity}
              stroke={dot.accented ? 'rgba(249,168,212,0.88)' : 'rgba(255,255,255,0.55)'}
              strokeWidth={dot.accented ? 2.1 : 0.8}
            />
          ))}

          <g opacity="0.74">
            <circle cx={CENTER.x} cy={CENTER.y} r="16" fill="none" stroke="rgba(255,255,255,0.18)" />
            <circle cx={CENTER.x} cy={CENTER.y} r="26" fill="none" stroke="rgba(255,255,255,0.1)" />
            <circle cx={CENTER.x} cy={CENTER.y} r="37" fill="none" stroke="rgba(255,255,255,0.09)" />
          </g>
        </svg>

        <div className="absolute left-1/2 top-2/4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/20 bg-white/5 px-2.5 py-1 text-[10px] tracking-tight text-white/80 backdrop-blur-sm">
          내 그룹
        </div>
      </div>

      <p className="mt-3 text-[11px] text-boot-muted">
        남자 {stats.male}팀 · 여자 {stats.female}팀 · 우리 {stats.myGroupSize}명 대기중
      </p>
      <p className="mt-1 text-[10px] leading-4 text-boot-muted">
        혼성 그룹도 참여할 수 있고, 남자/여자 팀 수는 매칭 계산에 쓰는 대표 성별 기준으로 보여줘요.
      </p>

      <Link
        href={homeHref}
        className="mt-3 mb-2 block w-full rounded-2xl btn-gradient py-3 text-center text-sm font-black text-boot-ink transition-colors"
      >
        홈으로 나가기
      </Link>

      <Link
        href={resultHref}
        className="mb-2 block w-full rounded-2xl border border-boot-primary/25 bg-boot-soft py-3 text-center text-sm font-black text-boot-primary transition-colors hover:bg-boot-primary/10"
      >
        매칭 결과 확인하기
      </Link>

      <button
        type="button"
        onClick={handleCancel}
        disabled={saving || !canCancel}
        className="w-full border border-red-200/60 py-2.5 text-[12px] font-bold text-red-400 transition-all disabled:cursor-not-allowed disabled:opacity-45"
      >
        큐에서 빠지기
      </button>

      <style jsx global>{`
        @keyframes spinWave {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes hydrateWave {
          0%, 100% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(-6deg) scale(1.02); }
        }
        @keyframes radarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  )
}

const QueueRadarCard = memo(function QueueRadarCard(props: QueueRadarCardProps) {
  return <QueueRadarCardInner {...props} />
})

export default QueueRadarCard
