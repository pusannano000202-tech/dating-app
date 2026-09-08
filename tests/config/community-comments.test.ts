import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  COMMUNITY_COMMENT_BODY_MAX,
  validateCommunityCommentInput,
} from '../../lib/community/contracts'

const ROOT = process.cwd()

function readSource(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

test('community comment input trims text and enforces a compact limit', () => {
  const valid = validateCommunityCommentInput({ body: '  좋은 의견이에요.\r\n감사합니다.  ' })
  assert.deepEqual(valid, {
    ok: true,
    value: { body: '좋은 의견이에요.\n감사합니다.' },
  })

  assert.deepEqual(validateCommunityCommentInput({ body: '   ' }), {
    ok: false,
    error: 'invalid_comment',
  })
  assert.deepEqual(validateCommunityCommentInput({
    body: '가'.repeat(COMMUNITY_COMMENT_BODY_MAX + 1),
  }), {
    ok: false,
    error: 'invalid_comment',
  })
})

test('community reply input accepts an optional parent comment id', () => {
  const parentCommentId = '83a1a5ce-1b3d-4a0e-9d50-d3a3e620398a'
  assert.deepEqual(validateCommunityCommentInput({
    body: '답글이에요.',
    parent_comment_id: parentCommentId,
  }), {
    ok: true,
    value: { body: '답글이에요.', parentCommentId },
  })
  assert.deepEqual(validateCommunityCommentInput({
    body: '잘못된 부모',
    parent_comment_id: 'not-a-uuid',
  }), {
    ok: false,
    error: 'invalid_parent_comment',
  })
})

test('community comments stay school scoped behind security definer RPCs', () => {
  const migration = readSource(
    'supabase/migrations/20260813074655_community_post_comments.sql',
  )

  assert.match(migration, /CREATE TABLE public\.community_post_comments/i)
  assert.match(migration, /ALTER TABLE public\.community_post_comments ENABLE ROW LEVEL SECURITY/i)
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.community_post_comments FROM PUBLIC, anon, authenticated/i,
  )
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/)
  assert.match(migration, /post\.school = v_school/)
  assert.match(migration, /CREATE FUNCTION public\.get_community_post/i)
  assert.match(migration, /CREATE FUNCTION public\.list_community_post_comments/i)
  assert.match(migration, /CREATE FUNCTION public\.create_community_post_comment/i)
  assert.match(migration, /CREATE FUNCTION public\.delete_community_post_comment/i)
  assert.match(
    migration,
    /CREATE FUNCTION public\.delete_community_post_comment[\s\S]*author_user_id = v_user_id[\s\S]*status = 'published'/i,
  )
  assert.match(migration, /comment_count BIGINT/i)
})

test('community comment API validates post ids and comment bodies', () => {
  const postApi = readSource('app/api/community/posts/[id]/route.ts')
  const commentsApi = readSource('app/api/community/posts/[id]/comments/route.ts')
  const commentApi = readSource(
    'app/api/community/posts/[id]/comments/[commentId]/route.ts',
  )

  assert.match(postApi, /get_community_post/)
  assert.match(commentsApi, /list_community_post_comments/)
  assert.match(commentsApi, /create_community_post_comment/)
  assert.match(commentsApi, /validateCommunityCommentInput/)
  assert.match(commentApi, /delete_community_post_comment/)
  assert.match(postApi + commentsApi + commentApi, /invalid_post_id/)
  assert.match(commentApi, /invalid_comment_id/)
})

test('community post lists open a detail page with comments', () => {
  const board = readSource('components/community/CommunityBoard.tsx')
  const hotBoard = readSource('components/community/HotCommunityBoard.tsx')
  const detail = readSource('components/community/CommunityPostDetail.tsx')
  const page = readSource('app/community/[category]/[postId]/page.tsx')

  assert.match(board, /comment_count/)
  assert.match(board, /\/community\/\$\{board\.id\}\/\$\{post\.id\}/)
  assert.match(hotBoard, /comment_count/)
  assert.match(hotBoard, /post\.category[\s\S]*post\.id/)
  assert.match(detail, /댓글/)
  assert.match(detail, /\/api\/community\/posts\/\$\{postId\}\/comments/)
  assert.match(detail, /COMMUNITY_COMMENT_BODY_MAX/)
  assert.match(page, /CommunityPostDetail/)
})

test('community comments support three levels, reactions, and collapsible replies', () => {
  const migration = readSource(
    'supabase/migrations/20260813220000_community_comment_threads_reactions.sql',
  )
  const commentsApi = readSource('app/api/community/posts/[id]/comments/route.ts')
  const reactionApi = readSource(
    'app/api/community/posts/[id]/comments/[commentId]/reaction/route.ts',
  )
  const detail = readSource('components/community/CommunityPostDetail.tsx')

  assert.match(migration, /parent_comment_id UUID/i)
  assert.match(migration, /depth SMALLINT[\s\S]*BETWEEN 0 AND 2/i)
  assert.match(migration, /parent\.post_id <> p_post_id/i)
  assert.match(migration, /parent\.depth >= 2/i)
  assert.match(migration, /CREATE TABLE public\.community_comment_reactions/i)
  assert.match(migration, /PRIMARY KEY \(comment_id, user_id\)/i)
  assert.match(migration, /CHECK \(reaction IN \('like', 'dislike'\)\)/i)
  assert.match(migration, /toggle_community_comment_reaction/i)
  assert.match(migration, /ON DELETE SET NULL/i)
  assert.match(migration, /anonymize_deleted_user_community_comments/i)
  assert.match(
    migration,
    /SET status = 'deleted',\s*body = '삭제된 댓글입니다\.',\s*author_alias = '익명'/i,
  )
  assert.doesNotMatch(migration, /SET status = 'deleted',\s*body = ''/i)
  assert.match(migration, /guard_community_comment_thread/i)
  assert.equal((migration.match(/MESSAGE = 'profile_required'/g) ?? []).length, 3)
  assert.match(commentsApi, /p_parent_comment_id: parsed\.value\.parentCommentId/)
  assert.match(reactionApi, /toggle_community_comment_reaction/)
  assert.match(detail, /답글/)
  assert.match(detail, /답글 .*개 (?:보기|숨기기)/)
  assert.match(detail, /comment\.like_count/)
  assert.match(detail, /comment\.dislike_count/)
  assert.match(detail, /koreanTime\.getUTCHours\(\)/)
  assert.doesNotMatch(detail, /Intl\.DateTimeFormat/)
})
