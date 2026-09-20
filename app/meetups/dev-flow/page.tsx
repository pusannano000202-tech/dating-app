import { notFound } from 'next/navigation'
import GuidedParticipationPreview from '@/components/qa/GuidedParticipationPreview'
import { isLeagueSport } from '@/lib/meetups/challenge-journey'

export const dynamic = 'force-dynamic'

export default async function GuidedParticipationPreviewPage({ searchParams }: {
  searchParams: Promise<{ scene?: string | string[]; ranking?: string | string[]; flow?: string | string[]; sport?: string | string[]; design?: string | string[] }>
}) {
  if (process.env.NODE_ENV !== 'development' || process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui') notFound()
  const { scene, ranking, flow, sport, design } = await searchParams
  const selected = scene === 'league' || scene === 'mentoring' || scene === 'courses' ? scene : 'overview'
  const rankingExample = ranking === 'leaders' || ranking === 'ties' ? ranking : 'empty'
  return <GuidedParticipationPreview scene={selected} ranking={rankingExample} design={design==='multiteam'} flow={flow==='invites'||flow==='recruitment'?flow:'league'} sport={isLeagueSport(sport)?sport:'lol'} />
}
