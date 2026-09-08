interface MbtiJourneyProgressProps {
  active: 1 | 2 | 3
}

const steps = ['내 유형', '경험 선택', '확인·동의'] as const

export default function MbtiJourneyProgress({ active }: MbtiJourneyProgressProps) {
  return (
    <ol className="flex items-center gap-1 text-[10px] font-black text-boot-muted sm:text-[11px]" aria-label="MBTI 응답 단계">
      {steps.map((label, index) => {
        const step = index + 1
        const current = step === active
        return (
          <li key={label} className={`flex min-h-6 items-center rounded-full px-2 sm:px-2.5 ${current ? 'bg-boot-soft text-boot-primary' : ''}`} aria-current={current ? 'step' : undefined}>
            {step} {label}
          </li>
        )
      })}
    </ol>
  )
}
