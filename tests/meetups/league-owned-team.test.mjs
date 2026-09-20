import test from 'node:test'
import assert from 'node:assert/strict'
import {selectOwnedLeagueTeam} from '../../lib/meetups/league-owned-team.ts'
const team=(id,owned=true)=>({id,players:[{is_me:owned,status:'accepted'}]})
const state={challenges:[{id:'a',status:'recruiting',teams:[team('team-a')]},{id:'b',status:'recruiting',teams:[team('opponent',false),team('team-b')]},{id:'c',status:'completed',teams:[team('ended')]}]}
test('opponent navigation acts on the selected team, never the first team',()=>{
 assert.equal(selectOwnedLeagueTeam(state,'b','team-b')?.team.id,'team-b')
 assert.equal(selectOwnedLeagueTeam(state,'b',null)?.team.id,'team-b')
 assert.equal(selectOwnedLeagueTeam(state,'b','opponent'),null)
 assert.equal(selectOwnedLeagueTeam(state,'missing',null),null)
 assert.equal(selectOwnedLeagueTeam(state,'c','ended'),null)
 assert.equal(selectOwnedLeagueTeam(state,null,null),null)
})
