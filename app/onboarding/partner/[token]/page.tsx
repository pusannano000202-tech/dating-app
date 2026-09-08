import type { Metadata } from 'next'

import PartnerInviteExperience from '@/components/tonight/PartnerInviteExperience'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PartnerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PartnerInviteExperience token={token} />
}
