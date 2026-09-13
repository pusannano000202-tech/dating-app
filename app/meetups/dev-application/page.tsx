import { notFound } from 'next/navigation'
import MeetupApplicationRehearsal from '@/components/qa/MeetupApplicationRehearsal'

export const dynamic = 'force-dynamic'

export default function MeetupApplicationRehearsalPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui') notFound()
  return <MeetupApplicationRehearsal />
}
