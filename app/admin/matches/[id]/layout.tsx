import type { ReactNode } from 'react'

import SuperAdminOnlyBoundary from '../../SuperAdminOnlyBoundary'

export default function AdminMatchEvidenceLayout({ children }: { children: ReactNode }) {
  return <SuperAdminOnlyBoundary redirectPath="/admin/matches">{children}</SuperAdminOnlyBoundary>
}
