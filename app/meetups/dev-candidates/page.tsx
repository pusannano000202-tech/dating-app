import {notFound} from 'next/navigation'
import CandidateBoardRehearsal from '@/components/qa/CandidateBoardRehearsal'
import {parseCandidateScope} from '@/lib/meetups/candidate-board-contract'
export const dynamic='force-dynamic'
export default async function CandidateDemoPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(process.env.NODE_ENV!=='development'||process.env.QUANTUM_LOCAL_RUNTIME_MODE!=='offline-ui')notFound()
 const params=await searchParams,scope=parseCandidateScope({kind:params.kind??'league',key:params.key??'lol'})
 if(!scope)notFound()
 return <CandidateBoardRehearsal key={`${scope.kind}:${scope.key}`} scope={scope}/>
}
