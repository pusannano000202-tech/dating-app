import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import DepartmentCourseDiscovery from '@/components/meetups/DepartmentCourseDiscovery'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function DepartmentCoursesPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  return <DepartmentCourseDiscovery />
}
