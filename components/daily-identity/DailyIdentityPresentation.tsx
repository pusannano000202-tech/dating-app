'use client'

import { Clock3, ShieldCheck, Sparkles } from 'lucide-react'
import { useId } from 'react'

import {
  DAILY_IDENTITY_DISCLOSURE,
  DAILY_IDENTITY_ODDS,
  DAILY_IDENTITY_SOURCES,
  rarityPresentation,
  type DailyIdentity,
  type DailyIdentityTier,
} from '@/lib/daily-identity'

const TIER_STYLE: Record<DailyIdentityTier, string> = {
  SS: 'border-[#7C4DFF]/25 bg-[linear-gradient(135deg,#F6F0FF_0%,#FFF8F0_55%,#FFFFFF_100%)] text-[#512DA8]',
  A: 'border-[#E6A23C]/25 bg-[linear-gradient(135deg,#FFF7E5_0%,#FFFFFF_100%)] text-[#9A5D00]',
  B: 'border-[#3B82F6]/20 bg-[linear-gradient(135deg,#EEF6FF_0%,#FFFFFF_100%)] text-[#1D4ED8]',
  C: 'border-boot-hairline bg-[linear-gradient(135deg,#F7F8FA_0%,#FFFFFF_100%)] text-boot-body',
}

type DailyIdentityPresentationProps = {
  identity: DailyIdentity
  className?: string
  headingId?: string
  exampleLabel?: string
}

export function DailyIdentityPresentation({
  identity,
  className = '',
  headingId: suppliedHeadingId,
  exampleLabel,
}: DailyIdentityPresentationProps) {
  const generatedHeadingId = `${useId()}-daily-identity-title`
  const headingId = suppliedHeadingId ?? generatedHeadingId
  const rarity = rarityPresentation(identity.tier)

  return (
    <section aria-labelledby={headingId} className={`overflow-hidden rounded-[28px] border p-5 shadow-[0_14px_38px_rgba(42,34,29,0.08)] ${TIER_STYLE[identity.tier]} ${className}`}>
      {exampleLabel && (
        <p className="mb-4 rounded-xl border border-current/15 bg-white/80 px-3 py-2 text-center text-[11px] font-black">
          {exampleLabel}
        </p>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black tracking-[-0.01em]"><Sparkles size={15} aria-hidden />오늘의 캐릭터 별명</p>
          <h2 id={headingId} className="mt-2 break-keep text-[clamp(1.65rem,8vw,2.35rem)] font-black leading-tight tracking-[-0.04em] text-boot-heading">{identity.displayName}</h2>
        </div>
        <span className="shrink-0 rounded-full border border-current/15 bg-white/70 px-3 py-1.5 text-xs font-black">{identity.tier}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
        <span className="rounded-full bg-white/75 px-3 py-1.5">{rarity.label}</span>
        <span className="rounded-full bg-white/75 px-3 py-1.5">{rarity.chance}</span>
      </div>
      <p className="mt-4 flex gap-2 text-xs font-bold leading-5 text-boot-muted"><Clock3 size={16} className="mt-0.5 shrink-0" aria-hidden />{DAILY_IDENTITY_DISCLOSURE.noReroll}</p>
      <p className="mt-2 flex gap-2 text-xs font-bold leading-5 text-boot-muted"><ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />{DAILY_IDENTITY_DISCLOSURE.noBenefit}</p>
      <details className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-xs text-boot-muted">
        <summary className="cursor-pointer font-black text-boot-body">등장 확률과 참고 기준</summary>
        <p className="mt-3 font-bold leading-5">SS {DAILY_IDENTITY_ODDS.SS}% · A {DAILY_IDENTITY_ODDS.A}% · B {DAILY_IDENTITY_ODDS.B}% · C {DAILY_IDENTITY_ODDS.C}%</p>
        <p className="mt-2 font-bold leading-5">{DAILY_IDENTITY_DISCLOSURE.sourceBasis}</p>
        <p className="mt-2 font-bold leading-5">{DAILY_IDENTITY_DISCLOSURE.licenseRisk}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {DAILY_IDENTITY_SOURCES.map((source) => <a key={source.href} className="font-black underline underline-offset-2" href={source.href} target="_blank" rel="noreferrer">{source.label}</a>)}
        </div>
        <p className="mt-2 font-bold">풀 버전 {identity.poolVersion} · 기준일 {identity.localDate}</p>
      </details>
    </section>
  )
}
