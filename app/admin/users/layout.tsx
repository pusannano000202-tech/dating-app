import type { ReactNode } from 'react'

import SuperAdminOnlyBoundary from '../SuperAdminOnlyBoundary'

export default function AdminUsersLayout({ children }: { children: ReactNode }) {
  return <SuperAdminOnlyBoundary redirectPath="/admin/users">{children}</SuperAdminOnlyBoundary>
}
