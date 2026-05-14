import type { ReactNode } from 'react'
import StepProgress from '@/components/profile/StepProgress'

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950">
      <StepProgress />
      {children}
    </div>
  )
}
