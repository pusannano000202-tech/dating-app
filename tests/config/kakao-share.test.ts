import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('group invite panel exposes Kakao share, browser share, and copy actions', () => {
  const invitePanel = readSource('components/matching/group-create/InviteFriendPanel.tsx')
  const groupCreate = readSource('app/group/create/page.tsx')
  const kakaoShare = readSource('lib/kakao-share.ts')

  assert.match(invitePanel, /카카오톡/)
  assert.match(invitePanel, /onShareInviteLink\('kakao'\)/)
  assert.match(invitePanel, /onShareInviteLink\('native'\)/)
  assert.match(invitePanel, /onShareInviteLink\('copy'\)/)

  assert.match(groupCreate, /shareGroupInviteOnKakao/)
  assert.match(groupCreate, /navigator\.share/)
  assert.match(groupCreate, /navigator\.clipboard\.writeText/)
  assert.match(groupCreate, /NEXT_PUBLIC_KAKAO_SHARE_ORIGIN/)
  assert.match(groupCreate, /카카오톡 공유를 열지 못해서 초대 링크를 복사했어요/)

  assert.match(kakaoShare, /NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY/)
  assert.match(kakaoShare, /sendDefault/)
  assert.match(kakaoShare, /objectType:\s*'text'/)
})

test('env examples document the Kakao JavaScript key without real secrets', () => {
  for (const path of ['.env.example', '.env.local.example']) {
    const source = readSource(path)
    assert.match(source, /NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=/)
    assert.match(source, /NEXT_PUBLIC_KAKAO_SHARE_ORIGIN=/)
    assert.doesNotMatch(source, /c3da0a26d9fa1170add025091337db5d/)
  }
})
