import type {JourneyState} from './challenge-journey'

/** Actions must stay scoped to the chosen team when an actor has several teams. */
export function selectOwnedLeagueTeam(state:JourneyState|null,challengeId:string|null,teamId:string|null){
 const challenge=state?.challenges.find(row=>row.id===challengeId&&row.status!=='completed')
 if(!challenge)return null
 const team=challenge.teams.find(row=>(!teamId||row.id===teamId)&&row.players.some(player=>player.is_me&&player.status==='accepted'))
 return team?{challenge,team}:null
}
