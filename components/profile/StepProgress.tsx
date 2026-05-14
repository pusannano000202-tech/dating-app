'use client'

import { usePathname } from 'next/navigation'

const STEPS = [
  { label: '이상형', path: '/profile/worldcup' },
  { label: '기본정보', path: '/profile/basic' },
  { label: '사진', path: '/profile/photos' },
  { label: '시간대', path: '/profile/schedule' },
  { label: '가중치', path: '/profile/preferences' },
]

export default function StepProgress() {
  const pathname = usePathname()
  const currentIdx = STEPS.findIndex((s) => pathname.startsWith(s.path))

  return (
    <div className="px-4 pt-6 pb-2">
      <div className="flex items-center gap-1.5 max-w-md mx-auto">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx
          const isActive = i === currentIdx
          return (
            <div key={step.path} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-1 w-full rounded-full transition-all duration-300 ${
                  isDone
                    ? 'bg-purple-400'
                    : isActive
                    ? 'bg-purple-600'
                    : 'bg-white/15'
                }`}
              />
              <span
                className={`text-[10px] transition-colors ${
                  isActive ? 'text-purple-400 font-semibold' : isDone ? 'text-purple-300/60' : 'text-gray-600'
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
