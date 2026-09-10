import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import DepartmentLeagueJourney from '@/components/community/department/DepartmentLeagueJourney'
import { isLeagueSport } from '@/lib/meetups/challenge-journey'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function DepartmentCommunityPage({ searchParams }: {
  searchParams: Promise<{ category?: string | string[]; sport?: string | string[]; legacy?: string | string[]; invite?: string | string[]; challenge?: string | string[] }>
}) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { category, sport, invite, challenge } = await searchParams
  const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  // Historical legacy links must not send people back to the list-only team builder.
  // These identifiers select a view; the authenticated API checks the invite recipient.
  return <DepartmentLeagueJourney initialSport={isLeagueSport(sport) ? sport : category === 'gaming' ? 'lol' : undefined} initialInviteId={uuid(invite) ? invite : undefined} initialChallengeId={uuid(challenge) ? challenge : undefined} />
}
