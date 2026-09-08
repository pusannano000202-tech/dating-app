'use client'

import PartnerTonightConsole from '@/components/tonight/PartnerTonightConsole'
import { createLivePartnerTonightAdapter } from '@/components/tonight/live-adapters'

const adapter = createLivePartnerTonightAdapter()

export default function PartnerTonightPage() {
  return <PartnerTonightConsole mode="live" adapter={adapter} />
}
