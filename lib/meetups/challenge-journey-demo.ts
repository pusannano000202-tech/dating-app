import {LEAGUE_SPORTS,sportTiers,type LeagueSport,type JourneyState,type JourneyPlayer,type JourneyTeam} from './challenge-journey'
import {LOL_TIERS,SOCCER_LEVELS,teamCompatibility} from './challenge-league'

const id=(n:number)=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const aliases=['하루','라임','모카','서윤','파도','초롱','마루','소금','나무','구름','보리']
export type LeagueRankingExample = 'empty' | 'leaders' | 'ties'
export type LeagueDemoLobby={proposal:string|null;transfer:{to_roster_id:string;to_alias:string;is_recipient:boolean}|null}
export type LeagueDemoState=JourneyState&{demo_lobby:LeagueDemoLobby;demo_lobbies?:Record<string,LeagueDemoLobby>}
export const leagueDemoLobby=(state:JourneyState,challengeId=state.challenges[0]?.id):LeagueDemoLobby=>{
 const demo=state as LeagueDemoState
 return demo.demo_lobbies?demo.demo_lobbies[challengeId]??{proposal:null,transfer:null}:challengeId===state.challenges[0]?.id?demo.demo_lobby??{proposal:null,transfer:null}:{proposal:null,transfer:null}
}
export function makeLeagueDemo(sport:LeagueSport,ranking:LeagueRankingExample='empty',fresh=false):LeagueDemoState{
 const definition=LEAGUE_SPORTS[sport],open=sport==='lol'?'mid':sport==='futsal'?'lm':'cm'
 const departments=['전자공학전공','정보컴퓨터공학부','화학공학과']
 const players=(opponent:boolean,candidate=0):JourneyPlayer[]=>definition.slots.filter(slot=>(opponent||!fresh)&&(opponent||slot.key!==open)).map((slot,index)=>({id:id((opponent?100*(candidate+1):20)+index),alias:aliases[(index+(opponent?3+candidate:0))%aliases.length],status:'accepted',is_me:false,slot:slot.key,position:slot.position,tier:sport==='lol'?'gold':'intermediate'}))
 const team=(opponent:boolean,candidate=0):JourneyTeam=>({id:id(opponent?4+candidate*2:2),department:opponent?departments[candidate]:'기계공학부',is_mine:false,is_captain:false,may_join:!opponent,ready:opponent,waiting:opponent,gap:candidate===1?300:200,score:opponent?(sport==='lol'?400:300):null,players:players(opponent,candidate)})
 // Opt-in visual examples only. Normal rehearsal still starts with no games.
 const records=ranking==='empty'?[]:['기계공학부',...departments].map((department,index)=>{
  const level=ranking==='ties'&&index>0?index-1:index
  return {department,played:8,wins:7-level,losses:1+level,draws:0,rating:1300-level*100}
 })
 return{sport,my_department:'기계공학부',month:'2026-09',standings:records,monthly_standings:records.map(record=>({...record})),demo_lobby:{proposal:null,transfer:null},challenges:[{id:id(1),title:'우리 과 첫 경기',status:'recruiting',revision:0,scheduled_at:null,ends_at:null,place_name:null,teams:[team(false)],schedule_proposals:[],result:null},...departments.map((_,index)=>({id:id(3+index*2),title:'함께할 상대 팀',status:'recruiting' as const,revision:0,scheduled_at:null,ends_at:null,place_name:null,teams:[team(true,index)],schedule_proposals:[],result:null}))]}
}
export type LeagueDemoAction={type:'create_team';slot:string;tier:string;title:string}|{type:'request';slot:string;tier:string;aspiration?:string;strengths?:string}|{type:'profile';slot:string;tier:string}|{type:'approve'}|{type:'propose';opponentTeamId:string}|{type:'accept_proposal'|'cancel_proposal'|'decline_proposal'|'captain_request_to_me'|'captain_accept'|'captain_decline'|'captain_cancel'}|{type:'captain_offer';recipientRosterId:string}|{type:'schedule';startsAt:string;endsAt:string;place:string}|{type:'finish'}|{type:'result';own:number;opponent:number}|{type:'confirm';own:number;opponent:number}
function refreshSampleScores(state:JourneyState,challengeId:string){
 const own=state.challenges.find(challenge=>challenge.id===challengeId)!.teams[0],me=own.players.find(player=>player.is_me)
 const tierScore=(tier:string)=>({...LOL_TIERS,...SOCCER_LEVELS})[tier as keyof typeof LOL_TIERS|keyof typeof SOCCER_LEVELS]
 const score=(team:JourneyTeam)=>teamCompatibility(team.players.filter(p=>p.status==='accepted').map(p=>tierScore(p.tier!)))
 if(own.ready)own.score=score(own)
 // The explicitly labeled offline fixture mirrors one tier so every chosen tier
 // has a compatible sample opponent. It never pretends this is a live team.
 if(me){const nearby=[...sportTiers(state.sport)].sort((a,b)=>Math.abs(tierScore(a)-tierScore(me.tier!))-Math.abs(tierScore(b)-tierScore(me.tier!)));state.challenges.filter(candidate=>candidate.id!==challengeId&&candidate.status==='recruiting'&&candidate.teams[0].ready&&candidate.teams[0].department!==own.department).forEach((candidate,index)=>{const opponent=candidate.teams[0],peer=opponent.players.find(player=>player.slot===me.slot);if(peer)peer.tier=nearby[index%nearby.length];opponent.score=score(opponent)})}
}
export function advanceLeagueDemo(state:JourneyState,action:LeagueDemoAction,challengeId=state.challenges[0]?.id):LeagueDemoState{
 const lobbies=structuredClone((state as LeagueDemoState).demo_lobbies??(state.challenges[0]?{[state.challenges[0].id]:leagueDemoLobby(state)}:{}))
 if(action.type==='create_team'){
  const slot=LEAGUE_SPORTS[state.sport].slots.find(slot=>slot.key===action.slot)
  if(!slot||!sportTiers(state.sport).includes(action.tier))throw new Error('demo_invalid_tier')
  if(action.title.trim().length<2||action.title.length>80)throw new Error('demo_invalid_title')
  const next={...structuredClone(state),demo_lobby:{proposal:null,transfer:null},demo_lobbies:lobbies},index=Math.max(10000,...state.challenges.map(challenge=>Number(challenge.id.slice(-12))||0))+10
  const team:JourneyTeam={id:id(index+1),team_name:action.title.trim(),department:state.my_department,is_mine:true,is_captain:true,may_join:false,ready:false,waiting:false,gap:200,score:null,players:[{id:id(index+2),alias:'하루',status:'accepted',is_me:true,slot:slot.key,position:slot.position,tier:action.tier}]}
  next.challenges=[{id:id(index),title:action.title.trim(),status:'recruiting',revision:0,scheduled_at:null,ends_at:null,place_name:null,teams:[team],schedule_proposals:[],result:null},...next.challenges.filter(c=>c.teams.some(t=>t.players.length>0))]
  return next
 }
 const next={...structuredClone(state),demo_lobby:structuredClone(leagueDemoLobby(state)),demo_lobbies:lobbies},challenge=next.challenges.find(challenge=>challenge.id===challengeId)
 if(!challenge)throw new Error('demo_challenge_required')
 const team=challenge.teams[0],lobby=lobbies[challenge.id]??(lobbies[challenge.id]={proposal:null,transfer:null})
 if(action.type==='request'||action.type==='profile'){
  const slot=LEAGUE_SPORTS[next.sport].slots.find(slot=>slot.key===action.slot)
  if(!sportTiers(next.sport).includes(action.tier))throw new Error('demo_invalid_tier')
  if(challenge.status!=='recruiting'||!slot||team.players.some(player=>player.slot===slot.key&&player.status==='accepted'&&!player.is_me))throw new Error('demo_slot_unavailable')
  const me=team.players.find(player=>player.is_me)
  if(action.type==='profile'){if(!me||me.status!=='accepted')throw new Error('demo_request_required');me.slot=slot.key;me.position=slot.position;me.tier=action.tier;refreshSampleScores(next,challenge.id)}
  else{if(me)throw new Error('demo_slot_unavailable');team.players.push({id:id(99),alias:'나',status:'requested',is_me:true,slot:slot.key,position:slot.position,tier:action.tier,application_intro:{aspiration:action.aspiration?.trim()??'',strengths:action.strengths?.trim()??''}});team.is_mine=true;team.may_join=false}
 }else if(action.type==='approve'){
  const me=team.players.find(player=>player.is_me&&player.status==='requested');if(!me)throw new Error('demo_request_required');me.status='accepted';team.ready=team.players.filter(p=>p.status==='accepted').length===LEAGUE_SPORTS[next.sport].capacity;refreshSampleScores(next,challenge.id)
 }else if(action.type==='captain_offer'||action.type==='captain_request_to_me'){
  if(challenge.status==='completed'||lobby.transfer)throw new Error('demo_transfer_unavailable')
  if(action.type==='captain_offer'&&!team.is_captain)throw new Error('demo_captain_required')
  const recipientId=action.type==='captain_offer'?action.recipientRosterId:null
  const recipient=team.players.find(p=>p.status==='accepted'&&(action.type==='captain_request_to_me'?p.is_me:p.id===recipientId&&!p.is_me))
  if(!recipient)throw new Error('demo_recipient_required')
  lobby.transfer={to_roster_id:recipient.id,to_alias:recipient.alias,is_recipient:recipient.is_me}
 }else if(action.type==='captain_accept'||action.type==='captain_decline'||action.type==='captain_cancel'){
  if(!lobby.transfer)throw new Error('demo_transfer_required')
  if(action.type==='captain_accept'){
   team.is_captain=lobby.transfer.is_recipient;team.waiting=false;lobby.proposal=null
   if(challenge.status==='opponent_pending')challenge.schedule_proposals=[]
   if(challenge.status==='result_pending'){challenge.status='scheduled';challenge.result=null}
  }
  lobby.transfer=null
 }else if(action.type==='propose'){
  if(!team.ready||challenge.status!=='recruiting')throw new Error('demo_team_required')
  if(!team.is_captain)throw new Error('demo_captain_required')
  if(lobby.proposal)throw new Error('demo_proposal_pending')
  const opponent=next.challenges.filter(c=>c.id!==challenge.id&&c.status==='recruiting').flatMap(c=>c.teams).find(t=>t.id===action.opponentTeamId&&t.department!==team.department)
  if(!opponent)throw new Error('demo_opponent_required')
  lobby.proposal=opponent.id;team.waiting=true
 }else if(action.type==='cancel_proposal'||action.type==='decline_proposal'){
  if(!lobby.proposal)throw new Error('demo_proposal_required')
  lobby.proposal=null
 }else if(action.type==='accept_proposal'){
  if(!lobby.proposal)throw new Error('demo_proposal_required')
  const opponent=next.challenges.filter(c=>c.id!==challenge.id&&c.status==='recruiting').flatMap(c=>c.teams).find(t=>t.id===lobby.proposal&&t.department!==team.department)
  if(!opponent||!team.ready||!team.is_captain)throw new Error('demo_team_required')
  challenge.teams.push(opponent);next.challenges=next.challenges.filter(c=>c.id===challenge.id||c.teams.some(t=>t.department===next.my_department));challenge.status='opponent_pending'
  team.waiting=false;opponent.waiting=false;lobby.proposal=null
 }else if(action.type==='schedule'){
  if(challenge.status!=='opponent_pending')throw new Error('demo_pair_required')
  challenge.status='scheduled';challenge.scheduled_at=action.startsAt;challenge.ends_at=action.endsAt;challenge.place_name=action.place
 }else if(action.type==='finish'){
  if(challenge.status!=='scheduled')throw new Error('demo_schedule_required')
  challenge.scheduled_at='2026-09-01T10:00:00.000Z';challenge.ends_at='2026-09-01T11:00:00.000Z'
 }else if(action.type==='result'){
  if(challenge.status!=='scheduled')throw new Error('demo_match_required');if(![action.own,action.opponent].every(score=>Number.isInteger(score)&&score>=0&&score<=999))throw new Error('demo_invalid_result');challenge.status='result_pending';challenge.result={first_score:action.own,second_score:action.opponent}
 }else if(action.type==='confirm'){
  if(challenge.status!=='result_pending')throw new Error('demo_result_required')
  if(challenge.result?.first_score!==action.own||challenge.result?.second_score!==action.opponent)throw new Error('demo_result_mismatch')
  challenge.status='completed';challenge.result={first_score:action.own,second_score:action.opponent}
  const record=(department:string,own:number,opponent:number)=>({department,played:1,wins:own>opponent?1:0,losses:own<opponent?1:0,draws:own===opponent?1:0})
  next.standings=[record(team.department,action.own,action.opponent),record(challenge.teams[1].department,action.opponent,action.own)];next.monthly_standings=next.standings
 }
 challenge.revision++;next.demo_lobby=lobbies[next.challenges[0]?.id]??{proposal:null,transfer:null};return next
}
