import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('department challenge UI and APIs use explicit challenge and roster state without creating friends', () => {
  const pagePath = 'app/community/department/page.tsx'
  const componentPath = 'components/community/department/DepartmentChallengeExperience.tsx'
  assert.equal(existsSync(pagePath), true)
  assert.equal(existsSync(componentPath), true)

  const source = read(componentPath)
  assert.match(source, /학과 대항/)
  assert.match(source, /팀 참가 요청/)
  assert.match(source, /팀에서 나가기/)
  assert.match(source, /상대 학과로 수락/)
  assert.match(source, /양쪽 주장이 같은 결과를 확인/)
  assert.doesNotMatch(source, /friend_requests|createFriend|자동 친구/)
})

test('challenge route family maps every state mutation to a dedicated authenticated RPC', () => {
  const routes = [
    ['app/api/community/department/challenges/route.ts', 'list_my_department_challenges', 'create_department_challenge'],
    ['app/api/community/department/challenges/[id]/route.ts', 'get_my_department_challenge'],
    ['app/api/community/department/challenges/[id]/opponent/route.ts', 'accept_department_challenge_opponent'],
    ['app/api/community/department/challenges/[id]/roster/route.ts', 'request_department_challenge_roster'],
    ['app/api/community/department/challenges/[id]/roster/[entryId]/accept/route.ts', 'accept_department_challenge_roster_request'],
    ['app/api/community/department/challenges/[id]/schedule/route.ts', 'confirm_my_department_challenge_schedule'],
    ['app/api/community/department/challenges/[id]/cancel/route.ts', 'cancel_my_department_challenge'],
    ['app/api/community/department/challenges/[id]/result/route.ts', 'confirm_my_department_challenge_result'],
  ] as const

  for (const [path, ...rpcs] of routes) {
    assert.equal(existsSync(path), true, `${path} must exist`)
    const source = read(path)
    assert.match(source, /createSupabaseRequestClient/)
    for (const rpc of rpcs) assert.match(source, new RegExp(rpc))
    if (source.includes('export async function POST')) assert.match(source, /assertTrustedMutationOrigin/)
  }

  assert.match(read('app/api/community/department/challenges/[id]/roster/route.ts'), /leave_my_department_challenge_roster/)
})
