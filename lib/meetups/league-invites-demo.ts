import {LEAGUE_SPORTS,sportTiers,type JourneyState,type JourneyPlayer} from './challenge-journey'
import {LOL_TIERS,SOCCER_LEVELS,teamCompatibility} from './challenge-league'
import type {LeagueInviteState,LeaguePositionInvite} from './league-invites'

type DemoInvite=LeaguePositionInvite&{friend_id:string}
export type LeagueInviteDemo={friends:{user_id:string;display_name:string}[];records:DemoInvite[];viewer:'captain'|'recipient';recipientId:string|null;sequence:number}
export type LeagueInviteDemoAction={type:'invite';challengeId:string;slot:string;friendId:string}|{type:'view_recipient'|'decline'|'cancel'|'expire';inviteId:string}|{type:'accept';inviteId:string;tier:string}|{type:'view_captain'}
const uuid=(index:number)=>`93000000-0000-4000-8000-${String(index).padStart(12,'0')}`
export function makeLeagueInviteDemo():LeagueInviteDemo{return{friends:['라임','모카','서윤','파도','초롱','마루','소금','나무','구름','보리'].map((display_name,index)=>({user_id:uuid(index+1),display_name})),records:[],viewer:'captain',recipientId:null,sequence:100}}
export function leagueInviteDemoSnapshot(journey:JourneyState,demo:LeagueInviteDemo,challengeId:string|null):LeagueInviteState{
 const challenge=journey.challenges.find(c=>c.id===challengeId),team=challenge?.teams.find(t=>t.department===journey.my_department)
 const canPreview=!!team&&(demo.viewer==='captain'?team.is_captain:team.players.some(player=>player.id===demo.recipientId&&player.status==='accepted')||demo.records.some(invite=>invite.challenge_id===challengeId&&invite.team_id===team.id&&invite.friend_id===demo.recipientId&&invite.status==='pending'&&Date.parse(invite.expires_at)>Date.now()))
 const present=(invite:DemoInvite):LeaguePositionInvite=>({...invite,revision:journey.challenges.find(c=>c.id===invite.challenge_id)?.revision??invite.revision,is_recipient:demo.viewer==='recipient'&&demo.recipientId===invite.friend_id,can_cancel:demo.viewer==='captain'&&invite.status==='pending'})
 return{sport:journey.sport,challenge_id:challengeId,revision:challenge?.revision??null,candidates:demo.viewer==='captain'?demo.friends.filter(friend=>!team?.players.some(player=>player.id===friend.user_id)&&!demo.records.some(invite=>invite.team_id===team?.id&&invite.friend_id===friend.user_id&&invite.status==='pending')):[],incoming:demo.records.filter(invite=>demo.viewer==='recipient'&&invite.friend_id===demo.recipientId).map(present),sent:demo.viewer==='captain'?demo.records.filter(invite=>invite.challenge_id===challengeId).map(present):[],preview:challenge&&team&&canPreview?{challenge_id:challenge.id,team_id:team.id,title:challenge.title,department:team.department,capacity:LEAGUE_SPORTS[journey.sport].capacity,players:team.players.filter(player=>player.status==='accepted').map(player=>({...player,is_me:demo.viewer==='captain'?player.is_me:player.id===demo.recipientId}))}:null}
}
export function advanceLeagueInviteDemo(journey:JourneyState,demo:LeagueInviteDemo,action:LeagueInviteDemoAction):{journey:JourneyState;invites:LeagueInviteDemo}{
 const next=structuredClone(journey),invites=structuredClone(demo)
 if(action.type==='view_captain'){invites.viewer='captain';invites.recipientId=null;return{journey:next,invites}}
 if(action.type==='invite'){
  const challenge=next.challenges.find(c=>c.id===action.challengeId),team=challenge?.teams.find(t=>t.department===next.my_department),friend=invites.friends.find(f=>f.user_id===action.friendId)
  if(invites.viewer!=='captain'||!challenge||!team?.is_captain||challenge.status!=='recruiting')throw new Error('demo_captain_required')
  if(!friend||team.players.some(p=>p.id===friend.user_id))throw new Error('demo_friend_unavailable')
  if(!LEAGUE_SPORTS[next.sport].slots.some(slot=>slot.key===action.slot)||team.players.some(p=>p.status==='accepted'&&p.slot===action.slot)||invites.records.some(record=>record.team_id===team.id&&record.slot===action.slot&&record.status==='pending'))throw new Error('demo_slot_unavailable')
  invites.records.push({id:uuid(invites.sequence++),challenge_id:challenge.id,team_id:team.id,title:challenge.title,department:team.department,sport:next.sport,slot:action.slot,inviter_name:'하루',invitee_name:friend.display_name,status:'pending',expires_at:new Date(Date.now()+7*86400000).toISOString(),revision:challenge.revision,is_recipient:false,can_cancel:true,friend_id:friend.user_id})
  return{journey:next,invites}
 }
 const invite=invites.records.find(record=>record.id===action.inviteId)
 if(!invite)throw new Error('demo_invite_unavailable')
 if(action.type==='view_recipient'){invites.viewer='recipient';invites.recipientId=invite.friend_id;return{journey:next,invites}}
 if(invite.status!=='pending'||Date.parse(invite.expires_at)<=Date.now())throw new Error('demo_invite_unavailable')
 if(action.type==='cancel'||action.type==='expire'){
  if(invites.viewer!=='captain')throw new Error('demo_captain_required')
  invite.status=action.type==='cancel'?'cancelled':'expired';return{journey:next,invites}
 }
 if(invites.viewer!=='recipient'||invites.recipientId!==invite.friend_id)throw new Error('demo_recipient_required')
 if(action.type==='decline'){invite.status='declined';return{journey:next,invites}}
 if(action.type!=='accept')throw new Error('demo_invite_unavailable')
 const challenge=next.challenges.find(c=>c.id===invite.challenge_id),team=challenge?.teams.find(t=>t.id===invite.team_id),slot=LEAGUE_SPORTS[next.sport].slots.find(slot=>slot.key===invite.slot)
 if(!challenge||!team||challenge.status!=='recruiting')throw new Error('demo_invite_unavailable')
 if(!sportTiers(next.sport).includes(action.tier))throw new Error('demo_invalid_tier')
 if(!slot||team.players.some(p=>p.status==='accepted'&&p.slot===invite.slot)||team.players.filter(p=>p.status==='accepted').length>=LEAGUE_SPORTS[next.sport].capacity)throw new Error('demo_slot_unavailable')
 const player:JourneyPlayer={id:invite.friend_id,alias:invite.invitee_name,slot:slot.key,position:slot.position,tier:action.tier,status:'accepted',is_me:false}
 team.players.push(player);team.ready=team.players.filter(p=>p.status==='accepted').length===LEAGUE_SPORTS[next.sport].capacity
 const scores={...LOL_TIERS,...SOCCER_LEVELS};team.score=team.ready?teamCompatibility(team.players.filter(p=>p.status==='accepted').map(p=>scores[p.tier as keyof typeof scores])):null
 invite.status='accepted';challenge.revision++;invite.revision=challenge.revision
 return{journey:next,invites}
}
