import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const MIGRATION_NAME = '20260813174500_community_post_reactions_security.sql'

function readSource(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

test('community reactions keep one mutually exclusive choice per user and post', () => {
  const migration = readSource('supabase/migrations/20260810120000_community_hot_feed_and_likes.sql')
    + readSource(`supabase/migrations/${MIGRATION_NAME}`)

  assert.match(migration, /ALTER TABLE public\.community_post_likes[\s\S]*ADD COLUMN IF NOT EXISTS reaction TEXT/i)
  assert.match(migration, /CHECK \(reaction IN \('like', 'dislike'\)\)/i)
  assert.match(migration, /PRIMARY KEY \(post_id, user_id\)/i)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.toggle_community_post_reaction/i)
  assert.match(migration, /p_reaction TEXT/i)
  assert.match(migration, /ON CONFLICT \(post_id, user_id\)[\s\S]*DO UPDATE SET reaction = EXCLUDED\.reaction/i)
  assert.match(migration, /DELETE FROM public\.community_post_likes[\s\S]*reaction = p_reaction/i)
})

test('community feeds return both reaction counts and demote disliked posts', () => {
  const migration = readSource(`supabase/migrations/${MIGRATION_NAME}`)

  for (const field of ['like_count', 'liked_by_me', 'dislike_count', 'disliked_by_me']) {
    assert.match(migration, new RegExp(`${field}\\s+(?:BIGINT|BOOLEAN)`, 'i'))
  }
  assert.match(migration, /post\.created_at >= now\(\) - interval '7 days'/i)
  assert.match(migration, /ORDER BY[\s\S]*reaction\.reaction = 'like'[\s\S]*-[\s\S]*reaction\.reaction = 'dislike'[\s\S]*DESC/i)
})

test('community write RPCs are authenticated, school scoped, and rate limited', () => {
  const migration = readSource(`supabase/migrations/${MIGRATION_NAME}`)

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.community_action_rate_limits/i)
  assert.match(migration, /ALTER TABLE public\.community_action_rate_limits ENABLE ROW LEVEL SECURITY/i)
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.community_action_rate_limits FROM PUBLIC, anon, authenticated/i,
  )
  assert.match(migration, /v_user_id UUID := auth\.uid\(\)/i)
  assert.match(migration, /post\.school = v_school/i)
  assert.match(migration, /MESSAGE = 'rate_limited'/i)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.toggle_community_post_reaction\(UUID, TEXT\) FROM PUBLIC, anon/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.toggle_community_post_reaction\(UUID, TEXT\) TO authenticated/i,
  )
})

test('reaction API validates a like or dislike and the detail UI exposes both controls', () => {
  const route = readSource('app/api/community/posts/[id]/reaction/route.ts')
  const detail = readSource('components/community/CommunityPostDetail.tsx')
  const board = readSource('components/community/CommunityBoard.tsx')

  assert.match(route, /validateCommunityReactionInput/)
  assert.match(route, /toggle_community_post_reaction/)
  assert.match(detail, /ThumbsUp/)
  assert.match(detail, /ThumbsDown/)
  assert.match(detail, /disliked_by_me/)
  assert.match(detail, /dislike_count/)
  assert.match(board, /dislike_count/)
})

test('personal reaction and author flags are never stored in shared caches', () => {
  const personalizedRoutes = [
    readSource('app/api/community/posts/route.ts'),
    readSource('app/api/community/posts/[id]/route.ts'),
    readSource('app/api/community/posts/[id]/comments/route.ts'),
  ]

  for (const source of personalizedRoutes) {
    assert.match(source, /'Cache-Control': 'private, no-store'/)
    assert.match(source, /Vary: 'Cookie, Authorization'/)
  }
})

test('comment reaction routes are personalized and validate one reaction choice', () => {
  const route = readSource('app/api/community/posts/[id]/comments/[commentId]/reaction/route.ts')
  assert.match(route, /validateCommunityReactionInput/)
  assert.match(route, /toggle_community_comment_reaction/)
  assert.match(route, /invalid_comment_id/)
  assert.match(route, /'Cache-Control': 'private, no-store'/)
  assert.match(route, /Vary: 'Cookie, Authorization'/)
})
