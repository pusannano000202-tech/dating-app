import {notFound} from 'next/navigation'
import CandidateBoardLive from '@/components/meetups/CandidateBoard'
import {parseCandidateScope} from '@/lib/meetups/candidate-board-contract'
export const dynamic='force-dynamic'
export default async function CandidatePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,scope=parseCandidateScope({kind:params.kind??'league',key:params.key??'lol'})
 if(!scope)notFound()
 const initialInviteId=typeof params.invite==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.invite)?params.invite:undefined
 return <CandidateBoardLive key={`${scope.kind}:${scope.key}:${initialInviteId??''}`} scope={scope} initialInviteId={initialInviteId}/>
}
