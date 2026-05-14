import type { ReactNode } from 'react'
import StepProgress from '@/components/profile/StepProgress'

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <StepProgress />
      {children}
    </div>
  )
}
