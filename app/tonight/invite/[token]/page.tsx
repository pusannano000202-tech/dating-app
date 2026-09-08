import type { Metadata } from 'next'

import FriendInviteExperience from '@/components/tonight/FriendInviteExperience'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function TonightFriendInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <FriendInviteExperience token={token} />
}
