import Link from 'next/link'
import {ArrowLeft} from 'lucide-react'
import {notFound} from 'next/navigation'
import MeetupApplications from '@/components/meetups/MeetupApplications'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import {applicationChatPath} from '@/lib/meetups/application-view'
import {isChatUuid} from '@/lib/chat/social-rooms-contract'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import s from '@/components/meetups/meetup-admission.module.css'
export default async function NativeApplicationsPage({params}:{params:Promise<{kind:string;id:string}>}){
 if(!isCommunityFeatureEnabled())return <CommunityComingSoon kind="meetups"/>
 const {kind,id}=await params;if((kind!=='study'&&kind!=='mentoring')||!isChatUuid(id))notFound()
 return <main className={s.page}><Link className={s.back} href={applicationChatPath(id,kind)}><ArrowLeft size={16}/>모임 채팅으로</Link><MeetupApplications meetupId={id} kind={kind}/></main>
}
