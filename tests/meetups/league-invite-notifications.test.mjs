import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {LEAGUE_SPORTS,isLeagueSport} from '../../lib/meetups/challenge-journey.ts'
import {readLeagueLocation} from '../../lib/meetups/league-navigation.ts'
const module = await import('../../lib/notifications/league-invite-presentation.ts').catch(() => ({}))
const present = (...args) => module.leagueInviteNotificationPresentation(...args)
const inviteId = '10000000-0000-4000-8000-000000000001'
const challengeId = '10000000-0000-4000-8000-000000000002'
const payload = {invite_id:inviteId,challenge_id:challengeId,sport:'lol',slot:'mid',inviter_display_name:'하루',title:'우리 과 첫 경기',status:'pending'}

test('position invite notification names the invited map position and links to that invite', () => {
  const result = present('department_league_invite', payload)
  assert.match(result.title, /하루.*MID/)
  assert.match(result.summary, /포지션.*실력/)
  assert.equal(result.href, `/meetups/league?sport=lol&invite=${inviteId}&challenge=${challengeId}`)
})

test('football and futsal invites are not rendered as a LoL lane', () => {
  for (const sport of ['futsal','football']) {
    const result = present('department_league_invite',{...payload,sport,slot:'gk'})
    assert.match(result.title,/골키퍼/)
    assert.match(result.href,new RegExp(`sport=${sport}`))
  }
})

test('canceled, declined, expired and accepted notifications never tell the user to newly accept', () => {
  for (const status of ['cancelled','declined','expired','accepted']) {
    const result = present('department_league_invite',{...payload,status})
    assert.doesNotMatch(result.title,/자리로 초대/)
    assert.doesNotMatch(result.summary,/선택하고 수락/)
    assert.match(result.href,/^\/meetups\/league\?/)
  }
})

test('notification destination ignores supplied href and rejects malformed sport or ids', () => {
  assert.equal(present('department_league_invite',{...payload,href:'https://evil.example'}).href,present('department_league_invite',payload).href)
  for (const patch of [{sport:'../../admin'},{invite_id:'../outside'},{challenge_id:'//evil.example'},{slot:'<script>'},{status:'fabricated'}]) {
    const result = present('department_league_invite',{...payload,...patch})
    assert.equal(result.href,'/meetups/league')
  }
  assert.equal(present('match_created',payload),null)
})

test('all registered map positions have an actionable notification destination', () => {
  for (const [sport,definition] of Object.entries(LEAGUE_SPORTS)) {
    for (const slot of definition.slots) {
      assert.match(present('department_league_invite',{...payload,sport,slot:slot.key}).href,/invite=/)
    }
  }
})

test('legacy URLs render the map journey and validate incoming invite identifiers', async () => {
  const source = await readFile(new URL('../../app/community/department/page.tsx',import.meta.url),'utf8')
  const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'makeElement'}}).outputText
  const dependencies = {
    '@/components/community/CommunityComingSoon': {default:'comingSoon'},
    '@/components/community/department/DepartmentLeagueJourney': {default:'mapJourney'},
    '@/lib/meetups/challenge-journey': {isLeagueSport},
    '@/lib/meetups/league-navigation': {readLeagueLocation},
    '@/lib/community-feature': {isCommunityFeatureEnabled:()=>true},
  }
  const exports = {}
  new Function('exports','require','makeElement',output)(exports,path=>{
    assert.ok(Object.hasOwn(dependencies,path),`unexpected dependency ${path}`)
    return dependencies[path]
  },(type,props)=>({type,props}))
  const view = await exports.default({searchParams:Promise.resolve({legacy:'1',sport:'lol',invite:inviteId,challenge:challengeId})})
  assert.equal(view.type,'mapJourney')
  assert.equal(view.props.initialInviteId,inviteId)
  assert.equal(view.props.initialChallengeId,challengeId)
  const invalid = await exports.default({searchParams:Promise.resolve({sport:['lol'],invite:'../admin',challenge:[challengeId]})})
  assert.equal(invalid.props.initialInviteId,undefined)
  assert.equal(invalid.props.initialChallengeId,undefined)
  assert.equal(invalid.props.initialSport,undefined)
})
