import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as feature from '../../lib/community-feature'

test('campus eat links follow the same production flags as their destination', () => {
  const enabled = (feature as unknown as { isCampusEatsFeatureEnabled: (input: { nodeEnv: string; communityEnabled: string; campusEatsEnabled: string }) => boolean }).isCampusEatsFeatureEnabled
  assert.equal(typeof enabled, 'function')
  for (const communityEnabled of ['true', 'false']) for (const campusEatsEnabled of ['true', 'false']) {
    assert.equal(enabled({ nodeEnv: 'production', communityEnabled, campusEatsEnabled }), communityEnabled === 'true' && campusEatsEnabled === 'true')
  }
  assert.equal(enabled({ nodeEnv: 'development', communityEnabled: 'false', campusEatsEnabled: 'false' }), true)
})
test('unreleased community destinations are labeled instead of advertising a broken link', () => {
  assert.match(readFileSync('app/community/content/page.tsx', 'utf8'), /campusEatsEnabled=/)
  const explorer = readFileSync('components/community/CommunityExperienceExplorer.tsx', 'utf8')
  assert.match(readFileSync('components/social/PhotoSceneCarousel.tsx', 'utf8'), /공개 준비 중/)
  assert.match(explorer, /disabled:.*visit.*!campusEatsEnabled/)
  assert.doesNotMatch(readFileSync('lib/community/experience-explorer.ts', 'utf8'), /id: 'delivery'/)
  assert.match(readFileSync('components/community/CommunitySpotlight.tsx', 'utf8'), /campusEatsEnabled &&/)
})
