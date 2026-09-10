import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
test('the selected empty map position opens a friend sheet and preserves its slot in the real mutation',async()=>{
 const journey=await read('components/community/department/DepartmentLeagueJourney.tsx'),invites=await read('components/community/department/LeaguePositionInvites.tsx')
 assert.match(journey,/if\(team\?\.is_captain&&!locked&&!occupant\)\{setInviteSlot\(slot\);return\}/)
 assert.match(journey,/<LeaguePositionInviteSheet[^\n]+slot=\{inviteSlot\}/)
 assert.match(invites,/controller\.command\('invite',\{challenge_id:challengeId,team_id:teamId,friend_user_id:friend,slot,expected_revision:/)
 assert.match(invites,/const endpoint='\/api\/community\/department\/league\/invites'/)
 assert.match(invites,/fetch\(endpoint,\{method:'POST'/)
 assert.match(journey,/pendingInvites=invites\.state\?\.sent\.filter\(invite=>invite\.team_id===team\?\.id&&invite\.status==='pending'/)
 assert.doesNotMatch(journey,/href="\/community\/department\?legacy=1"/)
})
test('recipient mutations require own tier and invitation revision, and the receiver map has no inert buttons',async()=>{
 const journey=await read('components/community/department/DepartmentLeagueJourney.tsx'),invites=await read('components/community/department/LeaguePositionInvites.tsx')
 assert.match(invites,/invite_id:invite\.id,expected_revision:invite\.revision,\.\.\.\(accept\?\{tier\}:\{\}\)/)
 assert.match(invites,/disabled=\{controller\.busy\|\|!tier\|\|!invite\.is_recipient\|\|!validPreview\|\|!!occupied\|\|!!controller\.error\}/)
 assert.match(journey,/pendingInvites=\{pending\} readOnly compact/)
 assert.match(journey,/const Slot=readOnly\?'div':'button'/)
 assert.doesNotMatch(invites,/challengeCommand\(.*accept|roster.*\/accept/)
})
test('the demo notification action opens the inbox before the recipient map',async()=>{
 const source=await read('components/community/department/DepartmentLeagueJourney.tsx')
 const transition=source.split('\n').find(line=>line.trim().startsWith('function openInvite('))
 const script=ts.transpileModule(transition,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const ids=[],challenges=[],stages=[],actions=[]
 const openInvite=new Function('demo','simulateInvite','setInviteId','setInviteChallengeId','setInviteSlot','setStage',script+';return openInvite')(true,action=>actions.push(action),id=>ids.push(id),id=>challenges.push(id),()=>{},stage=>stages.push(stage))
 openInvite({id:'received-invite',challenge_id:'invited-team'},true,true)
 assert.deepEqual(ids,[null]);assert.deepEqual(challenges,[null]);assert.deepEqual(stages,['invite'])
 assert.deepEqual(actions,[{type:'view_recipient',inviteId:'received-invite'}])
 openInvite({id:'received-invite',challenge_id:'invited-team'})
 assert.equal(ids.at(-1),'received-invite');assert.equal(challenges.at(-1),'invited-team')
})

test('a terminal or elapsed invitation cannot render a stale recipient team preview',async()=>{
 const source=await read('components/community/department/LeaguePositionInvites.tsx')
 const guard=source.split('\n').find(line=>line.trim().startsWith('const expired='))
 const canView=new Function('invite','preview','status',guard+';return validPreview')
 const invite={challenge_id:'challenge',team_id:'team',expires_at:new Date(Date.now()+60000).toISOString()},preview={challenge_id:'challenge',team_id:'team'}
 assert.equal(canView(invite,preview,'pending'),true)
 assert.equal(canView(invite,preview,'accepted'),true)
 for(const status of ['declined','cancelled','expired'])assert.equal(canView(invite,preview,status),false)
 assert.equal(canView({...invite,expires_at:new Date(Date.now()-1000).toISOString()},preview,'pending'),false)
 assert.equal(canView(invite,{...preview,team_id:'another-team'},'pending'),false)
})

test('every existing-team demo command is bound to the selected challenge before it updates state',async()=>{
 const source=await read('components/community/department/DepartmentLeagueJourney.tsx')
 const transition=source.split('\n').find(line=>line.trim().startsWith('function simulate('))
 const script=ts.transpileModule(transition,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const calls=[],updates=[]
 const make=selected=>new Function('demo','data','selected','setData','advanceLeagueDemo','setScheduleSubmitted','setScheduleSnapshot',script+';return simulate')(true,{challenges:[{id:'newest-team'},{id:'selected-team'}]},selected,state=>updates.push(state),(...args)=>{calls.push(args);return args[0]},()=>{},()=>{})
 const simulate=make({id:'selected-team'})
 for(const type of ['profile','request','approve','captain_offer','captain_accept','propose','accept_proposal','schedule','finish','result','confirm'])simulate({type})
 assert.equal(calls.length,11)
 assert.ok(calls.every(([,action,target])=>action.type&&target==='selected-team'))
 make(null)({type:'profile'})
 assert.equal(calls.length,11)
 assert.equal(updates.length,11)
})
