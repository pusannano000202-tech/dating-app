import {notFound} from 'next/navigation'
import HostedParticipationRehearsal from '@/components/qa/HostedParticipationRehearsal'
export const dynamic='force-dynamic'
export default function HostedRehearsalPage(){
 if(process.env.NODE_ENV!=='development'||process.env.QUANTUM_LOCAL_RUNTIME_MODE!=='offline-ui')notFound()
 return <HostedParticipationRehearsal/>
}
