'use client'

import { usePathname } from 'next/navigation'

const STEPS = [
  { label: '이상형', path: '/profile/worldcup' },
  { label: '기본정보', path: '/profile/basic' },
  { label: '사진',   path: '/profile/photos' },
  { label: '성격',   path: '/profile/survey' },
  { label: '시간대', path: '/profile/schedule' },
  { label: '가중치', path: '/profile/preferences' },
]

export default function StepProgress() {
  const pathname = usePathname()
  const currentIdx = STEPS.findIndex((s) => pathname.startsWith(s.path))

  if (currentIdx === -1) return null

  return (
    <div className="px-5 pt-8 pb-3 max-w-md mx-auto w-full">
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx
          const isActive = i === currentIdx
          return (
            <div key={step.path} className="flex-1 flex flex-col items-center gap-1.5">
              <div className={`h-1 w-full rounded-full transition-all duration-500 ${
                isDone ? 'gradient-brand' :
                isActive ? 'bg-violet-500' : 'bg-white/10'
              }`} />
              <span className={`text-[9px] font-medium tracking-wide transition-colors ${
                isActive ? 'text-violet-400' :
                isDone ? 'text-violet-600' : 'text-gray-700'
              }`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
