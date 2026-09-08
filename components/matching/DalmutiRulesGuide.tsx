'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DAY1_DALMUTI_RULES } from '@/lib/matching/day1-dalmuti-rules'
import { DAY1_DALMUTI_RULE_ARTWORK } from '@/lib/matching/day1-dalmuti-artwork'

export default function DalmutiRulesGuide() {
  const [step, setStep] = useState(0)
  const rule = DAY1_DALMUTI_RULES[step]

  return (
    <details className="rounded-2xl border border-[#ead8cf] bg-white">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-[#5c3930]">
        달무티 14컷 규칙 보기
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <div className="relative h-[min(40dvh,320px)] overflow-hidden rounded-xl bg-[#fff9f3]">
          <Image src={DAY1_DALMUTI_RULE_ARTWORK[step]} alt={rule.title} fill sizes="(max-width: 768px) 90vw, 640px" className="object-contain" />
        </div>
        <div aria-live="polite" aria-atomic="true" className="rounded-xl bg-[#fff8f2] p-4">
          <p className="text-xs font-semibold text-[#8b6354]">규칙 {step + 1} / {DAY1_DALMUTI_RULES.length}</p>
          <h4 className="mt-1 text-base font-bold text-[#35231e]">{rule.title}</h4>
          <p className="mt-2 text-sm leading-relaxed text-[#614b41]">{rule.rule}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-label="이전 규칙" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} className="flex min-h-11 items-center gap-1 rounded-xl border border-[#ead8cf] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft size={16} aria-hidden="true" /> 이전 규칙
          </button>
          <button type="button" aria-label="다음 규칙" disabled={step === DAY1_DALMUTI_RULES.length - 1} onClick={() => setStep((value) => Math.min(DAY1_DALMUTI_RULES.length - 1, value + 1))} className="flex min-h-11 items-center gap-1 rounded-xl border border-[#ead8cf] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
            다음 규칙 <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </details>
  )
}
