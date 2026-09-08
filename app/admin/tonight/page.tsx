'use client'

import AdminTonightConsole from '@/components/tonight/AdminTonightConsole'
import { createLiveAdminTonightAdapter } from '@/components/tonight/live-adapters'

const adapter = createLiveAdminTonightAdapter()

export default function AdminTonightPage() {
  return <AdminTonightConsole mode="live" adapter={adapter} />
}
