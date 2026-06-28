import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('daily card DB policy stays on user-picked 16-20 KST draw windows', () => {
  const migration = readSource('supabase/migrations/20260602_z54_daily_card_draw_policy.sql')

  assert.match(migration, /reveal_window_start/)
  assert.match(migration, /reveal_window_end/)
  assert.match(migration, /selected_at TIMESTAMPTZ/)
  assert.match(migration, /selected_by_user_id UUID/)
  assert.match(migration, /selected_slot SMALLINT/)
  assert.match(migration, /forfeited_at TIMESTAMPTZ/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.pick_match_daily_card/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.expire_missed_match_daily_cards/)
  assert.match(migration, /AT TIME ZONE 'Asia\/Seoul'/)
  assert.match(migration, /INTERVAL '16 hours'/)
  assert.match(migration, /INTERVAL '20 hours'/)
  assert.match(migration, /s\.selected_at IS NULL/)
  assert.match(migration, /s\.forfeited_at IS NULL/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /RAISE EXCEPTION 'no_draw_available'/)
  assert.match(migration, /CASE WHEN s\.selected_at IS NOT NULL THEN mcs\.content_text ELSE NULL END/)
  assert.match(migration, /Marks unpicked daily cards as forfeited after the 16:00-20:00 draw window/)
  assert.match(migration, /Content is hidden until the viewer group picks the card/)
  assert.doesNotMatch(migration, /INTERVAL '9 hours'/)
})

test('daily card API and match screen call the draw RPC instead of auto-revealing cards', () => {
  const route = readSource('app/api/matches/[id]/daily-cards/route.ts')
  const matchDetail = readSource('app/match/[id]/page.tsx')

  assert.match(route, /\.rpc\('get_match_daily_cards'/)
  assert.match(route, /\.rpc\('pick_match_daily_card'/)
  assert.match(route, /p_selection_slot:\s*selectedSlot/)
  assert.match(route, /daily_card_pick_failed/)
  assert.match(matchDetail, /16:00-20:00/)
  assert.match(matchDetail, /no_draw_available/)
  assert.match(matchDetail, /아직 공개 시간이 아니에요/)
  assert.match(matchDetail, /selected_at/)
  assert.match(matchDetail, /forfeited_at/)
})
