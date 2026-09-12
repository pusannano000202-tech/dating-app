import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../../lib/chat/social-room-presentation.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod={exports:{}};new Function('exports','module',code)(mod.exports,mod)
const {socialChatHref,socialRoomDetailHref,SOCIAL_CHAT_LABELS,mergeSocialChatRooms}=mod.exports
const id='12345678-1234-4234-8234-123456789012'
test('all social conversation destinations belong to chat, team and opponent remain distinct',()=>{
 for(const kind of ['meetup','activity_room','study_room','mentoring','league_match'])assert.equal(socialChatHref({kind,id}),'/chat/rooms/'+kind+'/'+id)
 assert.equal(socialChatHref({kind:'league_team',id}),'/chat/league-team/'+id)
 assert.notEqual(SOCIAL_CHAT_LABELS.league_team,SOCIAL_CHAT_LABELS.league_match)
})
test('untrusted destinations and matching do not enter social room routes',()=>{
 for(const room of [{kind:'match',id},{kind:'../admin',id},{kind:'meetup',id:'../admin'},{kind:'mentoring',id:'https://evil.test'}])assert.equal(socialChatHref(room),null)
 assert.equal(socialRoomDetailHref({kind:'study_room',id}),'/meetups/study?room='+id)
})
test('a team id equal to a match id cannot merge two conversations',()=>{
 const team={kind:'league_team',id,title:'A'},opponent={kind:'league_match',id,title:'A vs B'}
 assert.equal(mergeSocialChatRooms([team],[opponent]).length,2)
 assert.equal(mergeSocialChatRooms([team],[{...team,title:'B'}])[0].title,'B')
})
test('league details retain sport and exact challenge so return opens the correct map',()=>{
 const challenge='22345678-1234-4234-8234-123456789012'
 assert.equal(socialRoomDetailHref({kind:'league_match',id,sport:'lol'}),'/meetups/league?sport=lol&challenge='+id)
 assert.equal(socialRoomDetailHref({kind:'league_team',id,sport:'football',challenge_id:challenge}),'/meetups/league?sport=football&challenge='+challenge+'&team='+id)
 assert.equal(socialRoomDetailHref({kind:'league_match',id,sport:'../admin'}),'/meetups/league')
})
