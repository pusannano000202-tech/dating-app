import { notFound } from 'next/navigation'
import CampusSevenExperience from '@/components/matching/campus-seven/CampusSevenExperience'
import { getCampusSevenFeatureState } from '@/lib/campus-seven/program'

export default function CampusSevenPage() {
  const feature = getCampusSevenFeatureState()
  if (!feature.visible) notFound()

  return (
    <CampusSevenExperience
      applicationsOpen={feature.applicationsOpen}
      cardPaymentsEnabled={feature.cardPaymentsEnabled}
    />
  )
}
