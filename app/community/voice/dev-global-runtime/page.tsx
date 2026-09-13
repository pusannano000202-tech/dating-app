import { notFound } from 'next/navigation'
import { VoiceGlobalDockFixture } from '@/components/voice/VoiceGlobalProvider'
import VoiceParticipationFixture from '@/components/qa/VoiceParticipationFixture'

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; panel?: string }> }) {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui'
  ) notFound()
  const params = await searchParams
  if (params.panel === 'participation') return <VoiceParticipationFixture />
  const state = params.state
  const initialState = state === 'offered' || state === 'connected' || state === 'error' || state === 'cleanup_required' ? state : 'waiting'
  return <VoiceGlobalDockFixture initialState={initialState} />
}
