import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260905100001_minimum_community_access.sql'), 'utf8')

test('companion-only minimum members use a private community identity resolver', () => {
  assert.match(migration, /quantum_private\.get_community_identity/)
  assert.match(migration, /quantum_private\.community_member_profiles/)
  assert.match(migration, /resolve_profile_readiness/)
  assert.match(migration, /minimum_signup_complete/)
  assert.match(migration, /'부산대학교'/)
  assert.match(migration, /REVOKE ALL ON FUNCTION quantum_private\.get_community_identity/)
})

test('every school-scoped community consumer keeps its signature and uses the resolver', () => {
  const consumers = [
    'list_activity_meetups', 'create_activity_meetup', 'join_activity_meetup',
    'list_community_posts', 'list_hot_community_posts', 'get_community_post',
    'create_community_post', 'toggle_community_post_reaction',
    'list_community_post_comments', 'create_community_post_comment',
    'toggle_community_comment_reaction', 'list_reviewable_meetups', 'create_meetup_review',
  ]
  for (const name of consumers) {
    const start = migration.indexOf(`FUNCTION public.${name}(`)
    assert.notEqual(start, -1, `${name} must be replaced forward-only`)
    const body = migration.slice(start, migration.indexOf('$$;', start) + 3)
    assert.match(body, /quantum_private\.get_community_identity/, `${name} must resolve companion-only access`)
  }
})
