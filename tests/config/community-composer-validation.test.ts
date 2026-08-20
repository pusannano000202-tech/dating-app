import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import * as communityContracts from '../../lib/community/contracts'

test('community composer and API share visible title and body limits', () => {
  const limits = communityContracts as typeof communityContracts & {
    COMMUNITY_POST_TITLE_MIN?: number
    COMMUNITY_POST_TITLE_MAX?: number
    COMMUNITY_POST_BODY_MIN?: number
    COMMUNITY_POST_BODY_MAX?: number
  }

  assert.equal(limits.COMMUNITY_POST_TITLE_MIN, 4)
  assert.equal(limits.COMMUNITY_POST_TITLE_MAX, 80)
  assert.equal(limits.COMMUNITY_POST_BODY_MIN, 10)
  assert.equal(limits.COMMUNITY_POST_BODY_MAX, 2000)

  const board = fs.readFileSync(
    path.join(process.cwd(), 'components/community/CommunityBoard.tsx'),
    'utf8',
  )
  assert.match(board, /COMMUNITY_POST_TITLE_MIN/)
  assert.match(board, /COMMUNITY_POST_BODY_MIN/)
  assert.match(board, /disabled=\{busyPost\}/)
  assert.match(board, /data-draft-ready=\{isPostDraftValid\}/)
  assert.match(board, /제목 4자와 내용 10자를 채우면 올릴 수 있어요/)
  assert.match(board, /글 올리기/)
  assert.match(board, /aria-live="polite"/)
})
