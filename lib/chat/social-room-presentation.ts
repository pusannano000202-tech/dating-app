import type {SocialChatRoom,SocialChatRoomKind} from './social-rooms-contract'

export const SOCIAL_CHAT_LABELS:Record<SocialChatRoomKind,string> = {
 league_team:'학과 대항전 · 우리 팀',league_match:'학과 대항전 · 양 팀 경기',
 meetup:'모임',activity_room:'활동 모임',study_room:'전공 스터디',mentoring:'선후배 멘토링',
}
function valid<T extends {kind:string;id:string}>(room:T):room is T&{kind:SocialChatRoomKind;id:string}{
 return Object.hasOwn(SOCIAL_CHAT_LABELS,room.kind)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(room.id)
}
export function socialChatHref(room:{kind:string;id:string}):string|null {
 if(!valid(room))return null
 return room.kind==='league_team'?'/chat/league-team/'+room.id:'/chat/rooms/'+room.kind+'/'+room.id
}
export function socialRoomDetailHref(room:{kind:string;id:string;sport?:string;challenge_id?:string;recruitment_mode?:'hosted'|'legacy'}):string|null{
 if(!valid(room))return null
 switch(room.kind){
  case 'league_team':return room.sport&&['lol','futsal','football'].includes(room.sport)&&room.challenge_id&&valid({kind:'league_match',id:room.challenge_id})?'/meetups/league?sport='+room.sport+'&challenge='+room.challenge_id+'&team='+room.id:'/meetups/league'
  case 'league_match':return room.sport&&['lol','futsal','football'].includes(room.sport)?'/meetups/league?sport='+room.sport+'&challenge='+room.id:'/meetups/league'
  case 'meetup':return '/meetups/'+room.id
  case 'activity_room':return '/meetups/rooms/'+room.id
  case 'study_room':return '/meetups/study?room='+room.id
  case 'mentoring':return room.recruitment_mode==='hosted'?'/meetups/mentoring-rooms/'+room.id:'/meetups/department/mentoring?session='+room.id
 }
}
export function mergeSocialChatRooms(previous:SocialChatRoom[],next:SocialChatRoom[]):SocialChatRoom[]{
 return sortSocialChatRooms(Array.from(new Map([...previous,...next].map(room=>[room.kind+':'+room.id,room])).values()))
}
export function sortSocialChatRooms(rooms:SocialChatRoom[]):SocialChatRoom[]{
 return [...rooms].sort((a,b)=>Number((b.unread_count??0)>0)-Number((a.unread_count??0)>0)||Date.parse(b.latest_message?.created_at??b.updated_at)-Date.parse(a.latest_message?.created_at??a.updated_at)||(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id))
}
export function socialChatTime(value:string){return new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
