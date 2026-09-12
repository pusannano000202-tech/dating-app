import {Suspense} from 'react'
import {notFound} from 'next/navigation'
import NativeApplicationExperience from '@/components/meetups/NativeApplicationExperience'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import {isChatUuid} from '@/lib/chat/social-rooms-contract'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
export default async function NativeApplicationPage({params}:{params:Promise<{kind:string;id:string}>}){
 if(!isCommunityFeatureEnabled())return <CommunityComingSoon kind="meetups"/>
 const {kind,id}=await params;if((kind!=='study'&&kind!=='mentoring')||!isChatUuid(id))notFound()
 return <Suspense fallback={<p role="status">참가 조건을 확인하고 있어요…</p>}><NativeApplicationExperience kind={kind} id={id}/></Suspense>
}
