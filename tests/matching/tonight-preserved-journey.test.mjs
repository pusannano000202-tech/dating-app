import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function load(path, dependencies = {}) {
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('exports', 'require', js)(exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  })
  return exports
}

const now = Date.parse('2026-09-20T19:30:00+09:00')
const snapshot = () => ({
  round: { status: 'open', serviceDate: '2026-09-20', startsAt: '2026-09-20T19:30:00+09:00', allocationPublishAt: '2026-09-20T18:32:00+09:00', depositDueAt: '2026-09-20T18:45:00+09:00' },
  application: { id: 'application', status: 'submitted', deposit: null },
  journey: null,
})
async function policy() {
  return load('components/tonight/tonight-primary-action.ts', {
    './user-action-policy': await load('components/tonight/user-action-policy.ts'),
    './tonight-journey-state': await load('components/tonight/tonight-journey-state.ts'),
  })
}

test('submitted and waitlisted receipts do not claim a team exists', async () => {
  const { tonightPrimaryAction } = await policy()
  const data = snapshot()
  assert.match(tonightPrimaryAction(data, now, true).title, /신청 완료/)
  data.application.status = 'waitlisted'
  assert.match(tonightPrimaryAction(data, now, true).title, /대기/)
})

test('deposit display follows the existing policy and the actual round deadline', async () => {
  const { tonightPrimaryAction } = await policy()
  const data = snapshot()
  data.round.status = 'awaiting_deposits'
  data.round.depositDueAt = '2026-09-20T20:15:00+09:00'
  data.application.status = 'allocated'
  data.journey = { applicationId: 'application', teamId: 'team', teamStatus: 'deposit_pending', canRevealExactVenue: false }
  const action = tonightPrimaryAction(data, now, true)
  assert.equal(action.panel, 'next')
  assert.match(action.title, /20:15/)
  assert.doesNotMatch(action.title, /18:45/)
  data.application.deposit = { status: 'paid' }
  assert.match(tonightPrimaryAction(data, now, true).title, /납부 완료/)
})

test('verified arrival and completed source lead to their original destinations', async () => {
  const { tonightPrimaryAction } = await policy()
  const data = snapshot()
  data.round.status = 'in_progress'
  data.application.status = 'allocated'
  data.application.deposit = { status: 'paid' }
  data.journey = { applicationId: 'application', teamId: 'team', teamStatus: 'in_progress', canRevealExactVenue: true, canMarkArrival: true, attendanceStatus: 'expected' }
  assert.equal(tonightPrimaryAction(data, now, true).panel, 'place')
  data.journey.attendanceStatus = 'arrived'
  data.journey.canMarkArrival = false
  assert.equal(tonightPrimaryAction(data, now, true).panel, 'guide')
  data.round.status = 'completed'
  data.journey.teamStatus = 'completed'
  assert.equal(tonightPrimaryAction(data, now, true).panel, 'next')
  assert.match(tonightPrimaryAction(data, now, true).title, /마쳤/)
  assert.equal(tonightPrimaryAction(data, now, false).refresh, true)
})

test('a completed team waits for the existing round completion gate before offering continuation', async () => {
  const { tonightPrimaryAction } = await policy()
  const data = snapshot()
  data.round.status = 'in_progress'
  data.application.deposit = { status: 'paid' }
  data.journey = { teamId: 'team', teamStatus: 'completed' }
  const action = tonightPrimaryAction(data, now, true)
  assert.doesNotMatch(action.label, /만남 이후 선택/)
  assert.match(action.description, /회차/)
})

test('cancelled and financial exception states do not offer ongoing activity guidance', async () => {
  const { tonightPrimaryAction } = await policy()
  const data = snapshot()
  data.round.status = 'cancelled'
  assert.equal(tonightPrimaryAction(data, now, true).panel, 'help')
  data.application.deposit = { status: 'refund_requested', refundStatus: 'processing' }
  assert.match(tonightPrimaryAction(data, now, true).title, /환불/)
})

test('UI reconnects existing preparation and preserves receipt, consent and continuation', async () => {
  const source = await readFile(new URL('../../components/tonight/UserTonightExperience.tsx', import.meta.url), 'utf8')
  assert.match(source, /useCalendarReadiness/)
  assert.match(source, /await readiness\.check\(\)/)
  assert.match(source, /<TonightPreparationGate/)
  assert.match(source, /<ActivityRanker/)
  assert.match(source, /matchingConsentVersion: '2026-09-03'/)
  assert.match(source, /<FriendInviteSharePanel/)
  assert.match(source, /<TonightContinuationEntry/)
  assert.match(source, /내가 제출한 활동 순위/)
  assert.doesNotMatch(source, /팀의 1순위 활동을 합산/)
  assert.doesNotMatch(source, /18:55 전에는/)
})

test('tab navigation keeps invite and continuation instances mounted for idempotent retry', async () => {
  const source = await readFile(new URL('../../components/tonight/UserTonightExperience.tsx', import.meta.url), 'utf8')
  assert.match(source, /<div hidden=\{activePanel !== 'next'\}[\s\S]*?<FriendInviteSharePanel[\s\S]*?<TonightContinuationEntry[\s\S]*?<\/div>/)
  assert.doesNotMatch(source, /activePanel === 'next' && application\.bundle/)
  assert.doesNotMatch(source, /activePanel === 'next' && mode === 'live'/)
  const invites = await readFile(new URL('../../components/tonight/FriendInviteSharePanel.tsx', import.meta.url), 'utf8')
  assert.match(invites, /\[load, mode, roundId, memberCount, readAttempt\]/)
  assert.match(invites, /if \(roundChanged\) \{[\s\S]*?cancelKeysRef\.current\.clear\(\)/)
  assert.match(invites, /\{readError && \(/)
  assert.match(invites, /setReadAttempt\(\(value\) => value \+ 1\)/)
  assert.match(invites, /기존 초대 다시 확인/)
})

test('invite preparation reuses canonical readiness and a fixed safe resume destination', async () => {
  const invite = await readFile(new URL('../../components/tonight/FriendInviteExperience.tsx', import.meta.url), 'utf8')
  assert.match(invite, /\/tonight\/prepare\?returnTo=/)
  assert.doesNotMatch(invite, /\/profile\/match-card\?redirect=/)
  const page = await readFile(new URL('../../app/tonight/(protected)/prepare/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /query\.returnTo === '\/tonight\/invite\/resume'/)
  assert.match(page, /requireServerAccess/)
  assert.match(page, /context="tonight"/)
  const preparation = await readFile(new URL('../../components/matching/CalendarMatchingPreparation.tsx', import.meta.url), 'utf8')
  assert.match(preparation, /<AppearanceScoreGate expectedOwner=\{expectedOwner\}/)
  assert.match(preparation, /sameAccount/)
  assert.match(preparation, /useCalendarReadiness/)
})
