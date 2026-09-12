import {LEAGUE_SPORTS,leagueTeamName,type LeagueSport,type JourneyState} from './challenge-journey'
import {makeLeagueDemo,advanceLeagueDemo} from './challenge-journey-demo'
import {LOL_TIERS,SOCCER_LEVELS,teamCompatibility} from './challenge-league'
import type {LeagueRecruitmentNotice,LeagueRecruitmentTeam,LeagueRecruitmentDetail} from './league-recruitment'
export type LeagueRecruitmentDemo={notices:LeagueRecruitmentNotice[];captainChallengeId:string|null;originalCaptain:boolean}
export type LeagueRecruitmentDemoAction={type:'view_captain'|'view_member'|'cancel_request';challengeId:string}|{type:'approve'|'reject';challengeId:string;rosterId?:string}|{type:'publish';challengeId:string;preferredAt:string;summary:string}|{type:'close';challengeId:string}
const uuid=(index:number)=>`94000000-0000-4000-8000-${String(index).padStart(12,'0')}`
export function emptyRecruitmentDemo():LeagueRecruitmentDemo{return{notices:[],captainChallengeId:null,originalCaptain:false}}
export function makeLeagueRecruitmentDemo(sport:LeagueSport):{journey:JourneyState;recruitment:LeagueRecruitmentDemo}{
 const journey=makeLeagueDemo(sport),definition=LEAGUE_SPORTS[sport],open=sport==='lol'?'jungle':sport==='futsal'?'st':'lw'
 const sample=journey.challenges[1].teams[0]
 const teams=[0,1].map(index=>{
  const challenge=structuredClone(journey.challenges[0]),team=structuredClone(sample),name=index===0?'A팀 · 오늘 한 판':'B팀 · 천천히 함께'
  team.id=uuid(index*100+2);team.team_name=name;team.department=journey.my_department;team.is_mine=false;team.is_captain=false;team.may_join=true;team.ready=false;team.waiting=false;team.score=null
  const remaining=definition.slots.filter(slot=>slot.key!==open).slice(0,definition.capacity-1-index)
  team.players=remaining.map((slot,p)=>({id:uuid(index*100+p+10),alias:['하루','라임','모카','파도','초롱','마루','소금','나무','구름','보리'][p],slot:slot.key,position:slot.position,tier:sport==='lol'?'gold':'intermediate',status:'accepted',is_me:false}))
  challenge.id=uuid(index*100+1);challenge.title=name;challenge.teams=[team];return challenge
 })
 journey.challenges=[...teams,...journey.challenges.slice(1)]
 const recruitment=emptyRecruitmentDemo(),now=new Date().toISOString(),preferredAt=new Date(Date.now()+86400000).toISOString(),team=teams[0].teams[0]
 recruitment.notices=[{id:uuid(900),team_id:team.id,challenge_id:teams[0].id,team_name:leagueTeamName(team),department:journey.my_department,sport,capacity:definition.capacity,accepted_count:team.players.length,empty_slots:[open],reserved_slots:[],preferred_at:preferredAt,summary:'한 자리 남았어요. 처음 만나는 학과 친구도 환영해요!',status:'open',expires_at:preferredAt,created_at:now,updated_at:now,revision:0,is_captain:false,href:`/meetups/league?sport=${sport}&challenge=${teams[0].id}`}]
 return{journey,recruitment}
}
type Reservation={team_id:string;slot:string}
export function recruitmentDemoRows(journey:JourneyState,recruitment:LeagueRecruitmentDemo,reservations:Reservation[]=[]):{teams:LeagueRecruitmentTeam[];notices:LeagueRecruitmentNotice[]}{
 const definition=LEAGUE_SPORTS[journey.sport]
 const teams=journey.challenges.filter(c=>c.status!=='completed').flatMap(challenge=>challenge.teams.filter(team=>team.department===journey.my_department).map(team=>{
  const accepted=team.players.filter(p=>p.status==='accepted'),mine=team.players.find(p=>p.is_me),reserved=reservations.filter(item=>item.team_id===team.id&&!accepted.some(p=>p.slot===item.slot)).map(item=>item.slot),empty=definition.slots.filter(slot=>!accepted.some(p=>p.slot===slot.key)&&!reserved.includes(slot.key)).map(slot=>slot.key)
  const raw=recruitment.notices.find(notice=>notice.team_id===team.id),notice=raw?{...raw,team_name:leagueTeamName(team,challenge.title),accepted_count:accepted.length,empty_slots:empty,reserved_slots:reserved,is_captain:team.is_captain,revision:challenge.revision,status:raw.status==='closed'||raw.status==='filled'?raw.status:challenge.status!=='recruiting'?'matched' as const:Date.parse(raw.expires_at)<=Date.now()?'expired' as const:empty.length===0?'filled' as const:'open' as const}:null
  return{team_id:team.id,challenge_id:challenge.id,team_name:leagueTeamName(team,challenge.title),title:challenge.title,department:team.department,sport:journey.sport,status:challenge.status,revision:challenge.revision,capacity:definition.capacity,accepted_count:accepted.length,empty_slots:empty,reserved_slots:reserved,is_captain:team.is_captain,my_status:mine?.status??'none' as const,may_join:team.may_join&&challenge.status==='recruiting'&&empty.length>0,notice}
 }))
 return{teams,notices:teams.flatMap(team=>team.notice?[team.notice]:[])}
}
export function recruitmentDemoDetail(journey:JourneyState,recruitment:LeagueRecruitmentDemo,challengeId:string,reservations:Reservation[]=[]):LeagueRecruitmentDetail{
 const challenge=journey.challenges.find(c=>c.id===challengeId),row=recruitmentDemoRows(journey,recruitment,reservations).teams.find(team=>team.challenge_id===challengeId)
 if(!challenge||!row)throw new Error('recruitment_team_unavailable')
 return{sport:journey.sport,my_department:journey.my_department,team_id:row.team_id,challenge,empty_slots:row.empty_slots,reserved_slots:row.reserved_slots,notice:row.notice}
}
export function advanceRecruitmentDemo(journey:JourneyState,recruitment:LeagueRecruitmentDemo,action:LeagueRecruitmentDemoAction):{journey:JourneyState;recruitment:LeagueRecruitmentDemo}{
 let next=structuredClone(journey);const state=structuredClone(recruitment),challenge=next.challenges.find(c=>c.id===action.challengeId),team=challenge?.teams.find(t=>t.department===next.my_department)
 if(!challenge||!team)throw new Error('recruitment_team_unavailable')
 function restoreMemberView(){if(state.captainChallengeId){const previous=next.challenges.find(c=>c.id===state.captainChallengeId)?.teams.find(t=>t.department===next.my_department);if(previous){previous.is_captain=state.originalCaptain;previous.is_mine=state.originalCaptain||previous.players.some(player=>player.is_me);previous.may_join=!previous.is_mine&&previous.players.filter(player=>player.status==='accepted').length<LEAGUE_SPORTS[next.sport].capacity}}state.captainChallengeId=null}
 if(action.type==='view_captain'){if(state.captainChallengeId!==challenge.id){restoreMemberView();state.captainChallengeId=challenge.id;state.originalCaptain=team.is_captain;team.is_captain=true}return{journey:next,recruitment:state}}
 if(action.type==='view_member'){restoreMemberView();return{journey:next,recruitment:state}}
 if(action.type==='cancel_request'||action.type==='reject'){
  if(action.type==='reject'&&(!team.is_captain||challenge.status!=='recruiting'))throw new Error('captain_required')
  if(action.type==='cancel_request'&&state.captainChallengeId)throw new Error('member_required')
  const requested=team.players.find(p=>p.status==='requested'&&(action.type==='reject'&&action.rosterId?p.id===action.rosterId:p.is_me));if(!requested)throw new Error('request_required')
  team.players=team.players.filter(p=>p!==requested);team.is_mine=team.is_captain||team.players.some(p=>p.is_me);team.may_join=!team.is_mine&&team.players.filter(p=>p.status==='accepted').length<LEAGUE_SPORTS[next.sport].capacity;challenge.revision++
 }else if(action.type==='approve'){
  if(!team.is_captain||challenge.status!=='recruiting')throw new Error('captain_required')
  const requested=team.players.find(p=>p.status==='requested'&&(action.rosterId?p.id===action.rosterId:p.is_me));if(!requested)throw new Error('request_required')
  const accepted=team.players.filter(p=>p.status==='accepted');if(accepted.length>=LEAGUE_SPORTS[next.sport].capacity||accepted.some(p=>p.slot===requested.slot))throw new Error('slot_occupied')
  if(requested.is_me)next=advanceLeagueDemo(next,{type:'approve'},challenge.id)
  else{requested.status='accepted';team.ready=accepted.length+1===LEAGUE_SPORTS[next.sport].capacity;if(team.ready){const scores:Record<string,number>={...LOL_TIERS,...SOCCER_LEVELS};team.score=teamCompatibility(team.players.filter(p=>p.status==='accepted').map(p=>scores[p.tier??'']))}challenge.revision++}
  if(next.challenges.find(c=>c.id===challenge.id)?.teams[0].ready){const notice=state.notices.find(n=>n.team_id===team.id);if(notice)notice.status='filled'}
 }else{
  if(!team.is_captain||challenge.status!=='recruiting')throw new Error('captain_required')
  const existing=state.notices.find(notice=>notice.team_id===team.id)
  if(action.type==='close'){if(!existing)throw new Error('notice_unavailable');existing.status='closed';challenge.revision++}
  else{
   if(action.type!=='publish')throw new Error('invalid_notice_action')
   const row=recruitmentDemoRows(next,state).teams.find(t=>t.team_id===team.id)!
   if(!row.empty_slots.length||!action.summary.trim()||action.summary.trim().length>160||!Number.isFinite(Date.parse(action.preferredAt))||Date.parse(action.preferredAt)<=Date.now())throw new Error('invalid_notice')
   challenge.revision++;const now=new Date().toISOString(),notice:LeagueRecruitmentNotice={id:existing?.id??uuid(900+state.notices.length),team_id:team.id,challenge_id:challenge.id,team_name:leagueTeamName(team,challenge.title),department:team.department,sport:next.sport,capacity:row.capacity,accepted_count:row.accepted_count,empty_slots:row.empty_slots,reserved_slots:[],preferred_at:action.preferredAt,summary:action.summary.trim(),status:'open',expires_at:action.preferredAt,created_at:existing?.created_at??now,updated_at:now,revision:challenge.revision,is_captain:true,href:`/meetups/league?sport=${next.sport}&challenge=${challenge.id}`}
   state.notices=state.notices.filter(n=>n.team_id!==team.id).concat(notice)
  }
 }
 return{journey:next,recruitment:state}
}
