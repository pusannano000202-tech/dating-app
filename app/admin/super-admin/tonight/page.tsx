'use client'

import SuperAdminTonightConsole from '@/components/tonight/SuperAdminTonightConsole'
import { createLiveSuperAdminTonightAdapter } from '@/components/tonight/live-adapters'

const adapter = createLiveSuperAdminTonightAdapter()

export default function SuperAdminTonightPage() {
  return <SuperAdminTonightConsole mode="live" adapter={adapter} />
}
