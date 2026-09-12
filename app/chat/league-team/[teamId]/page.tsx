import {notFound} from 'next/navigation'
import LeagueTeamChat from '@/components/community/department/LeagueTeamChat'

export default async function LeagueTeamChatPage({params}:{params:Promise<{teamId:string}>}){
 const {teamId}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamId))notFound()
 return <LeagueTeamChat teamId={teamId}/>
}
