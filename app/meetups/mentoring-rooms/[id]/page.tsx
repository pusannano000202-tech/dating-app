import {Suspense} from 'react'
import {notFound} from 'next/navigation'
import HostedMentoringRoom from '@/components/meetups/HostedMentoringRoom'
import {isHostedMentoringId} from '@/lib/mentoring/hosted-contract'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
export default async function HostedMentoringPage({params}:{params:Promise<{id:string}>}){
 if(!isCommunityFeatureEnabled())return <CommunityComingSoon kind="meetups"/>
 const {id}=await params;if(!isHostedMentoringId(id))notFound()
 return <Suspense fallback={<p role="status">멘토링을 확인하고 있어요…</p>}><HostedMentoringRoom id={id}/></Suspense>
}
