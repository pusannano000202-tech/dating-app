import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import DepartmentChallengeExperience from '@/components/community/department/DepartmentChallengeExperience'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function DepartmentCommunityPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  return <DepartmentChallengeExperience />
}

