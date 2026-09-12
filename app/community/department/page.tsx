import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import DepartmentLeagueJourney from '@/components/community/department/DepartmentLeagueJourney'
import { isLeagueSport, LEAGUE_SPORTS } from '@/lib/meetups/challenge-journey'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function DepartmentCommunityPage({ searchParams }: {
  searchParams: Promise<{ category?: string | string[]; sport?: string | string[]; legacy?: string | string[]; invite?: string | string[]; challenge?: string | string[]; team?: string | string[]; panel?: string | string[]; slot?: string | string[] }>
}) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { category, sport, invite, challenge, team, panel, slot } = await searchParams
  const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  // Historical legacy links must not send people back to the list-only team builder.
  // These identifiers select a view; the authenticated API checks the invite recipient.
  const selectedSport = isLeagueSport(sport) ? sport : category === 'gaming' ? 'lol' : undefined
  const reviewSlot = selectedSport && typeof slot === 'string' && LEAGUE_SPORTS[selectedSport].slots.some(item => item.key === slot) ? slot : undefined
  return <DepartmentLeagueJourney initialSport={selectedSport} initialInviteId={uuid(invite) ? invite : undefined} initialChallengeId={uuid(challenge) ? challenge : undefined} initialTeamId={uuid(team) ? team : undefined} initialReview={panel === 'applications' && uuid(challenge) && uuid(team) && !!selectedSport} initialReviewSlot={reviewSlot} initialResult={panel === 'result' && uuid(challenge)} />
}
