import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const FRIEND_A = '11111111-1111-4111-8111-111111111111'

function sceneModule() {
  assert.ok(existsSync(resolve('lib/friends/scene.ts')), 'friend scene parser must exist')
  return require('../../lib/friends/scene') as {
    parseFriendSceneList(value: unknown): Array<{
      friendUserId: string
      kind: 'acquaintance' | 'app_met' | 'unclassified'
      evidence: 'direct_invite' | 'matching' | 'meetup' | 'unknown'
    }> | null
    friendSceneLabel(kind: string, evidence: string): string
  }
}

test('friend scene parser accepts only minimal evidence-backed projections', () => {
  const rows = sceneModule().parseFriendSceneList({
    friends: [{ friend_user_id: FRIEND_A, scene_kind: 'acquaintance', evidence_kind: 'direct_invite' }],
  })
  assert.deepEqual(rows, [{ friendUserId: FRIEND_A, kind: 'acquaintance', evidence: 'direct_invite' }])
  assert.equal(sceneModule().parseFriendSceneList({
    friends: [{ friend_user_id: FRIEND_A, scene_kind: 'app_met', evidence_kind: 'matching', source_match_id: FRIEND_A }],
  }), null)
  assert.equal(sceneModule().parseFriendSceneList({
    friends: [{ friend_user_id: FRIEND_A, scene_kind: 'app_met', evidence_kind: 'unknown' }],
  }), null)
})

test('friend scene labels never invent a meeting source', () => {
  assert.equal(sceneModule().friendSceneLabel('acquaintance', 'direct_invite'), '기존 지인')
  assert.equal(sceneModule().friendSceneLabel('app_met', 'matching'), '앱에서 만난 친구')
  assert.equal(sceneModule().friendSceneLabel('app_met', 'meetup'), '앱에서 만난 친구')
  assert.equal(sceneModule().friendSceneLabel('unclassified', 'unknown'), '출처 미분류')
  assert.equal(sceneModule().friendSceneLabel('app_met', 'unknown'), '출처 확인 불가')
})
