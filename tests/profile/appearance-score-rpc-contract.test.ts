import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapAppearanceScoreCompletion } from '../../lib/profile/appearance-score-persistence'

test('AI response names map explicitly to private database column parameters', () => {
  const mapped = mapAppearanceScoreCompletion({
    userId: 'user-1',
    photoRevision: 'photo-revision-1',
    requestId: 'request-1',
    analyzedAt: '2026-08-02T00:00:00.000Z',
    result: {
      ok: true,
      score: 42,
      appearanceType: 'warm',
      confidence: 0.73,
      modelVersion: 'model-v1',
      promptVersion: 'prompt-v2',
      anchorManifestVersion: 'anchors-v3',
    },
  })

  assert.equal(mapped.p_score_raw, 42)
  assert.equal(mapped.p_score_normalized, 0.42)
  assert.equal(mapped.p_confidence_0_1, 0.73)
  assert.equal(mapped.p_anchor_version, 'anchors-v3')
  assert.equal(mapped.p_photo_revision, 'photo-revision-1')
  assert.equal(mapped.p_request_id, 'request-1')
})

test('score route uses only service RPCs for claim, completion, and failure writes', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/score/route.ts'), 'utf8')

  assert.match(route, /\.rpc\(\s*'claim_private_appearance_score'/)
  assert.match(route, /\.rpc\(\s*'complete_private_appearance_score'/)
  assert.match(route, /\.rpc\(\s*'fail_private_appearance_score'/)
  assert.match(route, /mapAppearanceScoreCompletion/)
  assert.doesNotMatch(route, /\.from\(APPEARANCE_SCORE_TABLE\)[\s\S]{0,120}?\.update\(/)
  assert.doesNotMatch(route, /\.from\(APPEARANCE_SCORE_TABLE\)[\s\S]{0,120}?\.upsert\(/)
})
