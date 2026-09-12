import Link from 'next/link'
import {ArrowLeft} from 'lucide-react'
import {notFound} from 'next/navigation'
import MeetupApplications from '@/components/meetups/MeetupApplications'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import s from '@/components/meetups/meetup-admission.module.css'

export default async function MeetupApplicationsPage({params}:{params:Promise<{id:string}>}){
 if(!isCommunityFeatureEnabled())return <CommunityComingSoon kind="meetups"/>
 const {id}=await params
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound()
 return <main className={s.page}><Link className={s.back} href={`/meetups/${id}`}><ArrowLeft size={17}/>모임으로 돌아가기</Link><MeetupApplications meetupId={id}/></main>
}
