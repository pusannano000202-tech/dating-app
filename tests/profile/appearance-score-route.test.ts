import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'app/api/score/route.ts'), 'utf8')

test('score route reuses ready scores only from the approved OpenAI analysis version', () => {
  assert.match(route, /APPROVED_APPEARANCE_ANALYSIS_VERSION/)
  assert.match(route, /state\.provider === 'openai'/)
  assert.match(
    route,
    /state\.model_version === APPROVED_APPEARANCE_ANALYSIS_VERSION\.modelVersion/,
  )
  assert.match(
    route,
    /state\.prompt_version === APPROVED_APPEARANCE_ANALYSIS_VERSION\.promptVersion/,
  )
  assert.match(
    route,
    /state\.anchor_version === APPROVED_APPEARANCE_ANALYSIS_VERSION\.anchorManifestVersion/,
  )
  assert.doesNotMatch(route, /hasText\(state\.(?:provider|model_version|prompt_version|anchor_version)\)/)
})
