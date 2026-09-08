import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = (path: string) => readFileSync(path, 'utf8')

type PresentationModule = {
  parseDepartmentChallenges: (value: unknown) => Array<{ id: string; teams: unknown[] }> | null
  buildDepartmentRosterSlots: (input: {
    capacity: number
    acceptedCount: number
    acceptedMembers: Array<{ id: string; alias: string }>
  }) => Array<{ kind: 'known' | 'hidden' | 'empty'; label: string }>
  resolveCreatedChallengeRefresh: (
    createdChallengeId: string | null,
    challenges: Array<{ id: string }> | null,
  ) => 'ready' | 'needs_reload'
}

const validChallenge = {
  id: '10000000-0000-4000-8000-000000000001',
  category: 'gaming',
  title: '게임 플레이메이커',
  rules: '',
  status: 'recruiting',
  revision: 0,
  team_capacity: 5,
  scheduled_at: null,
  ends_at: null,
  place_name: null,
  can_accept_opponent: false,
  is_captain: true,
  teams: [{
    id: '20000000-0000-4000-8000-000000000002',
    side: 'challenger',
    department_label: '기계공학과',
    accepted_count: 1,
    capacity: 5,
    is_captain: true,
    may_request_roster: true,
    roster: [{
      id: '30000000-0000-4000-8000-000000000003',
      alias: '기계 여우',
      status: 'accepted',
      is_me: true,
    }],
  }],
  result: null,
}

function loadPresentationModule(): PresentationModule {
  const helperPath = 'components/community/department/department-challenge-presentation.ts'
  assert.equal(existsSync(helperPath), true, 'department presentation helper must exist')
  const exports = {}
  const output = ts.transpileModule(read(helperPath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', output)(exports)
  return exports as PresentationModule
}

test('department team composer follows the approved playmaker scene without fake members', () => {
  const componentPath = 'components/community/department/DepartmentChallengeExperience.tsx'
  const stylesPath = 'components/community/department/department-challenge.module.css'

  assert.equal(existsSync(stylesPath), true)

  const component = read(componentPath)
  const styles = read(stylesPath)

  assert.match(component, /우리 과/)
  assert.match(component, /PLAYMAKER/)
  assert.match(component, />게임</)
  assert.match(component, />축구</)
  assert.match(component, /팀 만들고 친구 초대하기/)
  assert.match(component, /게임 종류·규칙 설정 \(선택\)/)
  assert.match(component, /category === 'soccer' \? '경기 규칙·준비물 설정 \(선택\)'/)
  assert.match(component, /\/social-scenes\/department-clubhouse-gaming\.webp/)
  assert.match(component, /\/social-scenes\/home-playmaker-football\.webp/)
  assert.match(component, /category === 'gaming' \?/)
  assert.match(component, /useState<'soccer' \| 'gaming'>\('gaming'\)/)
  assert.match(component, /팀원 프로필이 아닌 활동 분위기 이미지/)
  assert.match(component, /팀을 먼저 만든 뒤 수락한 친구만 합류해요/)
  assert.match(component, /Math\.min\(capacity, 5\)/)
  assert.match(component, /buildDepartmentRosterSlots\(\{[\s\S]*?capacity: team\.capacity,[\s\S]*?acceptedCount: team\.accepted_count/)
  assert.match(component, /parseDepartmentChallenges\(payload\?\.challenges\)/)
  assert.doesNotMatch(component, /verified|인증 배지|실제 팀원 예시/)

  assert.match(styles, /#fffaf6/i)
  assert.match(styles, /#b34c3e/i)
  assert.match(styles, /-webkit-text-stroke/)
  assert.match(styles, /@media \(min-width: 900px\)/)
})

test('create retries keep one idempotency key and a created team opens its real invite panel', () => {
  const component = read('components/community/department/DepartmentChallengeExperience.tsx')

  assert.match(component, /createIdempotencyKeyRef/)
  assert.match(component, /createdChallengeId/)
  assert.match(component, /startInviteOpen/)
  assert.match(component, /payload\?\.challenge/)
})

test('redacted accepted members occupy confirmed slots without exposing aliases', () => {
  const { buildDepartmentRosterSlots } = loadPresentationModule()
  const slots = buildDepartmentRosterSlots({
    capacity: 5,
    acceptedCount: 3,
    acceptedMembers: [],
  })

  assert.deepEqual(slots.map((slot) => slot.kind), ['hidden', 'hidden', 'hidden', 'empty', 'empty'])
  assert.deepEqual(slots.slice(0, 3).map((slot) => slot.label), ['참여 중', '참여 중', '참여 중'])
})

test('post-create recovery requires the created team to be present before claiming its invite panel is open', () => {
  const { parseDepartmentChallenges, resolveCreatedChallengeRefresh } = loadPresentationModule()
  const createdId = '10000000-0000-4000-8000-000000000001'

  assert.equal(resolveCreatedChallengeRefresh(createdId, null), 'needs_reload')
  assert.equal(resolveCreatedChallengeRefresh(createdId, [{ id: 'other-team' }]), 'needs_reload')
  assert.equal(resolveCreatedChallengeRefresh(createdId, [{ id: createdId }]), 'ready')
  assert.equal(resolveCreatedChallengeRefresh('not-a-uuid', [{ id: 'not-a-uuid' }]), 'needs_reload')
  const malformedCreatedId = parseDepartmentChallenges([{ ...validChallenge, id: 'not-a-uuid' }])?.[0]?.id ?? null
  assert.equal(resolveCreatedChallengeRefresh(malformedCreatedId, null), 'needs_reload')

  const component = read('components/community/department/DepartmentChallengeExperience.tsx')
  assert.match(component, /resolveCreatedChallengeRefresh/)
  assert.match(component, /parseDepartmentChallenges\(\[result\.payload\?\.challenge\]\)/)
  assert.match(component, /팀은 만들어졌어요\. 목록을 다시 불러오면 이 팀의 초대 패널을 열 수 있어요\./)
})

test('challenge parser accepts the empty list and one complete projected row', () => {
  const { parseDepartmentChallenges } = loadPresentationModule()

  assert.deepEqual(parseDepartmentChallenges([]), [])
  assert.deepEqual(parseDepartmentChallenges([validChallenge]), [validChallenge])
  assert.deepEqual(
    parseDepartmentChallenges([{ ...validChallenge, is_captain: false, teams: [] }]),
    [{ ...validChallenge, is_captain: false, teams: [] }],
  )
})

test('challenge parser rejects null rows and malformed roster entries', () => {
  const { parseDepartmentChallenges } = loadPresentationModule()

  assert.equal(parseDepartmentChallenges([null]), null)
  assert.equal(parseDepartmentChallenges([{ ...validChallenge, teams: [{ ...validChallenge.teams[0], roster: [null] }] }]), null)
  assert.equal(parseDepartmentChallenges([{ ...validChallenge, teams: [{ ...validChallenge.teams[0], roster: [{ ...validChallenge.teams[0].roster[0], status: 'hidden' }] }] }]), null)
})

test('challenge parser rejects invalid schedules and count or capacity ranges', () => {
  const { parseDepartmentChallenges } = loadPresentationModule()

  assert.equal(parseDepartmentChallenges([{ ...validChallenge, scheduled_at: 'not-a-date' }]), null)
  assert.equal(parseDepartmentChallenges([{ ...validChallenge, scheduled_at: '2026-09-10T12:00:00Z', ends_at: '2026-09-10T11:00:00Z', place_name: '운동장' }]), null)
  assert.equal(parseDepartmentChallenges([{ ...validChallenge, team_capacity: 1 }]), null)
  assert.equal(parseDepartmentChallenges([{ ...validChallenge, teams: [{ ...validChallenge.teams[0], accepted_count: 6 }] }]), null)
})

test('mobile keeps the primary create action above bottom navigation while desktop stays inline', () => {
  const component = read('components/community/department/DepartmentChallengeExperience.tsx')
  const styles = read('components/community/department/department-challenge.module.css')

  assert.match(component, /styles\.createActionBar/)
  assert.match(styles, /@media \(max-width: 599px\)[\s\S]*?\.createActionBar\s*{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*calc\([^;]*safe-area-inset-bottom[^;]*\);/)
  assert.match(styles, /@media \(max-width: 599px\)[\s\S]*?\.composer\s*{[\s\S]*?padding-bottom:\s*1[01][0-9]px;/)
  assert.match(styles, /@media \(min-width: 600px\)[\s\S]*?\.createActionBar\s*{[\s\S]*?position:\s*static;/)
})
