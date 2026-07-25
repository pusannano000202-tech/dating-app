import { notFound } from 'next/navigation'
import CampusEatsPilot from '@/components/campus-eats/CampusEatsPilot'

function isCampusEatsPilotEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true

  return process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_CAMPUS_EATS_ENABLED === 'true'
}

export default function CampusEatsPage() {
  if (!isCampusEatsPilotEnabled()) notFound()

  return <CampusEatsPilot />
}
