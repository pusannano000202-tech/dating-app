import type { ReactNode } from 'react'

import SuperAdminOnlyBoundary from '../../SuperAdminOnlyBoundary'

export default function AdminMatchReviewLayout({ children }: { children: ReactNode }) {
  return <SuperAdminOnlyBoundary redirectPath="/admin/matches/review">{children}</SuperAdminOnlyBoundary>
}
