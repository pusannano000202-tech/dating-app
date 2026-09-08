'use client'

import { usePathname } from 'next/navigation'

const STEPS = [
  { label: '기본정보', path: '/profile/basic' },
  { label: '이상형', path: '/profile/worldcup' },
  { label: '사진', path: '/profile/photos' },
]

export default function StepProgress() {
  const pathname = usePathname()
  const currentIdx = STEPS.findIndex((step) => pathname.startsWith(step.path))

  if (pathname.startsWith('/profile/basic')) return null
  if (currentIdx === -1) return null

  return (
    <div aria-label="매칭 준비 진행률" className="mx-auto w-full max-w-md px-5 pb-3 pt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-black text-boot-primary">매칭 준비</p>
        <p className="text-[10px] font-bold text-boot-muted">기본 가입 후 선택</p>
      </div>
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, index) => {
          const isDone = index < currentIdx
          const isActive = index === currentIdx

          return (
            <div key={step.path} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`h-1 w-full rounded-full transition-all duration-500 ${
                  isDone
                    ? 'gradient-brand'
                    : isActive
                      ? 'bg-boot-primary'
                      : 'bg-boot-hairline'
                }`}
              />
              <span
                className={`text-[9px] font-bold tracking-normal transition-colors ${
                  isActive
                    ? 'text-boot-primary'
                    : isDone
                      ? 'text-boot-coral'
                      : 'text-boot-muted'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

