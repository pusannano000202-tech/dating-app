import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  requestAppearanceScore,
  shouldDeferAppearanceScoreFailure,
} from '../../lib/profile/appearance-score'
import { isOwnedAppearanceStoragePath } from '../../lib/profile/appearance-score-storage'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('photo flow saves without starting appearance analysis or deferred analysis UI', () => {
  const photosPage = readSource('app/profile/photos/page.tsx')
  const completePage = readSource('app/profile/complete/page.tsx')

  assert.doesNotMatch(photosPage, /fetch\(['"]\/api\/score['"]/) ;
  assert.doesNotMatch(photosPage, /ScorePersistenceError/)
  assert.doesNotMatch(photosPage, /photoAnalysis=deferred/)
  assert.match(photosPage, /분석은 매칭 찾기를 시작할 때만 진행해요/)
  assert.doesNotMatch(completePage, /useSearchParams|photoAnalysis|analysisDeferred/)
  assert.match(completePage, /외모 분석은 매칭을 찾을 때만 진행합니다/)
  assert.doesNotMatch(completePage, /사진 관리에서 다시 분석/)
})

test('match-search gate explains actionable photo and retry failures without exposing details', () => {
  const scoreGate = readSource('components/matching/AppearanceScoreGate.tsx')

  assert.match(scoreGate, /photo_required/)
  assert.match(scoreGate, /분석할 대표 사진이 필요해요/)
  for (const code of [
    'photo_no_face',
    'photo_multiple_people',
    'photo_face_occluded',
    'photo_low_quality',
    'photo_minor_suspected',
  ]) {
    assert.match(scoreGate, new RegExp(code))
  }
  assert.match(scoreGate, /얼굴이 잘 보이는 본인 사진을 1장 이상 올려 주세요/)
  assert.match(scoreGate, /사진 다시 선택하기/)
  assert.match(scoreGate, /잠시 후 다시 시도해 주세요/)
  assert.doesNotMatch(scoreGate, /self_appearance_score_auto/)
})

test('appearance score failure preview is development-only and avoids a paid analysis request', () => {
  const preview = readSource('app/dev/appearance-score-gate-preview/page.tsx')
  const middleware = readSource('middleware.ts')

  assert.match(preview, /process\.env\.NODE_ENV !== ['"]development['"]/)
  assert.match(preview, /notFound\(\)/)
  assert.match(preview, /initialPhotoIssueCode=['"]photo_no_face['"]/)
  assert.doesNotMatch(preview, /fetch\(|prepareAppearanceScoreForMatch|\/api\/score/)
  assert.match(middleware, /process\.env\.NODE_ENV === ['"]production['"]/)
  assert.match(middleware, /pathname\.startsWith\(['"]\/dev\/['"]\)/)
  assert.match(middleware, /status:\s*404/)
})

test('only temporary AI failures are deferred; invalid photos and persistence failures still block', () => {
  for (const code of [
    'ai_server_timeout',
    'ai_server_unavailable',
    'ai_server_error',
    'ai_server_not_configured',
    'ai_quota_unavailable',
    'ai_response_invalid',
    'score_not_found',
  ]) {
    assert.equal(shouldDeferAppearanceScoreFailure(code), true, code)
  }

  for (const code of [
    'photo_no_face',
    'photo_multiple_people',
    'photo_face_occluded',
    'photo_low_quality',
    'photo_minor_suspected',
    'photo_not_owned',
    'profile_update_failed',
    'invalid_request',
  ]) {
    assert.equal(shouldDeferAppearanceScoreFailure(code), false, code)
  }
})

test('replacing profile photos invalidates stale automatic scores without starting analysis', () => {
  const photosPage = readSource('app/profile/photos/page.tsx')
  const invalidationMigration = readSource('supabase/migrations/20260801152500_invalidate_score_on_photo_change.sql')
  const scoreRoute = readSource('app/api/score/route.ts')

  assert.doesNotMatch(photosPage, /\/api\/score(?:\/invalidate)?/)
  assert.doesNotMatch(photosPage, /self_appearance_score_auto/)
  assert.doesNotMatch(photosPage, /appearance_score_normalized/)
  assert.match(invalidationMigration, /status = 'stale'/)
  assert.match(invalidationMigration, /score_raw = NULL/)
  assert.match(invalidationMigration, /score_normalized = NULL/)
  assert.doesNotMatch(scoreRoute, /replace_existing_score/)
})

test('appearance score API converts upstream failures into safe response codes', () => {
  const scoreRoute = [
    readSource('app/api/score/route.ts'),
    readSource('lib/profile/appearance-score.ts'),
  ].join('\n')

  assert.match(scoreRoute, /AI_SERVER_TIMEOUT_MS/)
  assert.match(scoreRoute, /ai_server_timeout/)
  assert.match(scoreRoute, /ai_server_unavailable/)
  assert.match(scoreRoute, /ai_server_error/)
  assert.match(scoreRoute, /ai_response_invalid/)
  assert.match(scoreRoute, /score_not_found/)
  assert.match(scoreRoute, /profile_update_failed/)
  assert.match(scoreRoute, /self_appearance_score_persisted:\s*false/)
})

test('appearance score API never returns the upstream payload or internal server URL', () => {
  const scoreRoute = readSource('app/api/score/route.ts')

  assert.doesNotMatch(scoreRoute, /NextResponse\.json\(data,\s*\{\s*status:\s*res\.status\s*\}\)/)
  assert.doesNotMatch(scoreRoute, /message:\s*error\.message/)
  assert.doesNotMatch(scoreRoute, /NextResponse\.json\([^)]*AI_SERVER_URL/)
})

test('appearance score API rejects malformed request JSON before contacting AI', () => {
  const scoreRoute = readSource('app/api/score/route.ts')

  assert.match(scoreRoute, /invalid_request/)
  assert.match(scoreRoute, /await req\.json\(\)/)
})

test('appearance score request classifies an AI timeout without leaking details', async () => {
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => {
      const error = new Error('internal host timed out')
      error.name = 'AbortError'
      throw error
    },
  })

  assert.deepEqual(result, { ok: false, code: 'ai_server_timeout', status: 504 })
})

test('appearance score request hides an AI 500 response body', async () => {
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => new Response('{"secret":"do-not-leak"}', { status: 500 }),
  })

  assert.deepEqual(result, { ok: false, code: 'ai_server_error', status: 502 })
})

test('appearance score request rejects invalid JSON', async () => {
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => new Response('not-json', { status: 200 }),
  })

  assert.deepEqual(result, { ok: false, code: 'ai_response_invalid', status: 502 })
})

test('appearance score request rejects objects outside the Python success contract', async () => {
  for (const payload of [{}, { status: 'unexpected' }]) {
    const result = await requestAppearanceScore({
      serverUrl: 'https://ai.internal',
      serverSecret: 'shared-secret',
      userId: 'user-1',
      photoUrls: ['https://storage.example/photo.jpg'],
      genderBank: 'female',
      timeoutMs: 10,
      fetchImpl: async () => Response.json(payload),
    })

    assert.deepEqual(result, { ok: false, code: 'ai_response_invalid', status: 502 })
  }
})

test('appearance score request accepts a validated Python score for server-side persistence', async () => {
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => Response.json({
      status: 'ok',
      score_0_100: 73,
      appearance_type: 'warm',
      confidence: 0.82,
      model_version: 'gpt-5.6-terra',
      prompt_version: 'appearance-anchor-v3',
      anchor_manifest_version: 'approved-v1',
      reject_code: 'none',
    }),
  })

  assert.deepEqual(result, {
    ok: true,
    score: 73,
    appearanceType: 'warm',
    confidence: 0.82,
    modelVersion: 'gpt-5.6-terra',
    promptVersion: 'appearance-anchor-v3',
    anchorManifestVersion: 'approved-v1',
  })
})

test('appearance score request requires the calibrated internal metadata contract', async () => {
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => Response.json({
      status: 'ok',
      score_0_100: 73,
      appearance_type: 'warm',
      confidence: 0.82,
      model_version: 'gpt-5.6-terra',
      prompt_version: 'appearance-anchor-v3',
      anchor_manifest_version: 'approved-v1',
      reject_code: 'none',
    }),
  })

  assert.deepEqual(result, {
    ok: true,
    score: 73,
    appearanceType: 'warm',
    confidence: 0.82,
    modelVersion: 'gpt-5.6-terra',
    promptVersion: 'appearance-anchor-v3',
    anchorManifestVersion: 'approved-v1',
  })
})

test('appearance score request rejects unapproved model, prompt, and anchor versions', async () => {
  const rejectedPayloads = [
    { model_version: 'gpt-5.6-luna' },
    { prompt_version: 'appearance-anchor-v1' },
    { anchor_manifest_version: 'pending-v2' },
  ]

  for (const override of rejectedPayloads) {
    const result = await requestAppearanceScore({
      serverUrl: 'https://ai.internal',
      serverSecret: 'shared-secret',
      userId: 'user-1',
      photoUrls: ['https://storage.example/photo.jpg'],
      genderBank: 'female',
      timeoutMs: 10,
      fetchImpl: async () => Response.json({
        status: 'ok',
        score_0_100: 73,
        appearance_type: 'warm',
        confidence: 0.82,
        model_version: 'gpt-5.6-terra',
        prompt_version: 'appearance-anchor-v3',
        anchor_manifest_version: 'approved-v1',
        reject_code: 'none',
        ...override,
      }),
    })

    assert.deepEqual(result, { ok: false, code: 'ai_response_invalid', status: 502 })
  }
})

test('appearance score request rejects an unknown appearance type', async () => {
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => Response.json({
      status: 'ok',
      score_0_100: 73,
      appearance_type: 'unknown',
      confidence: 0.82,
      model_version: 'gpt-5.6-terra',
      prompt_version: 'appearance-anchor-v3',
      anchor_manifest_version: 'approved-v1',
      reject_code: 'none',
    }),
  })

  assert.deepEqual(result, { ok: false, code: 'ai_response_invalid', status: 502 })
})

test('appearance score request authenticates to the internal AI server', async () => {
  let authorization: string | null = null
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async (_input, init) => {
      authorization = new Headers(init?.headers).get('Authorization')
      return Response.json({
        status: 'ok',
        score_0_100: 73,
        appearance_type: 'warm',
        confidence: 0.82,
        model_version: 'gpt-5.6-terra',
        prompt_version: 'appearance-anchor-v3',
        anchor_manifest_version: 'approved-v1',
        reject_code: 'none',
      })
    },
  })

  assert.equal(authorization, 'Bearer shared-secret')
  assert.deepEqual(result, {
    ok: true,
    score: 73,
    appearanceType: 'warm',
    confidence: 0.82,
    modelVersion: 'gpt-5.6-terra',
    promptVersion: 'appearance-anchor-v3',
    anchorManifestVersion: 'approved-v1',
  })
})

test('appearance score request exposes only whitelisted photo rejection codes', async () => {
  const rejected = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/screenshot.png'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => Response.json(
      {
        status: 'error',
        code: 'photo_no_face',
        message: 'internal prompt detail must not escape',
      },
      { status: 422 },
    ),
  })
  assert.deepEqual(rejected, { ok: false, code: 'photo_no_face', status: 422 })

  const unknown = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => Response.json(
      { status: 'error', code: 'internal_prompt_dump' },
      { status: 422 },
    ),
  })
  assert.deepEqual(unknown, { ok: false, code: 'ai_server_error', status: 502 })
})

test('appearance score request exposes a safe quota configuration code', async () => {
  const result = await requestAppearanceScore({
    serverUrl: 'https://ai.internal',
    serverSecret: 'shared-secret',
    userId: 'user-1',
    photoUrls: ['https://storage.example/photo.jpg'],
    genderBank: 'female',
    timeoutMs: 10,
    fetchImpl: async () => Response.json(
      { status: 'error', code: 'analysis_quota_unavailable' },
      { status: 503 },
    ),
  })

  assert.deepEqual(result, { ok: false, code: 'ai_quota_unavailable', status: 503 })
})

test('match-search gate keeps quota failures retryable without blocking photo storage', () => {
  const photosPage = readSource('app/profile/photos/page.tsx')
  const scoreGate = readSource('components/matching/AppearanceScoreGate.tsx')

  assert.doesNotMatch(photosPage, /shouldDeferAppearanceScoreFailure/)
  assert.equal(shouldDeferAppearanceScoreFailure('ai_quota_unavailable'), true)
  assert.match(scoreGate, /setState\('error'\)/)
})

test('photo uploader describes the current save and deferred analysis behavior truthfully', () => {
  const photoUpload = readSource('components/profile/PhotoUpload.tsx')

  assert.match(photoUpload, /사진을 프로필에 저장해요/)
  assert.match(photoUpload, /AI 분석은 매칭 찾기를 시작할 때만 진행해요/)
  assert.doesNotMatch(photoUpload, /사진은 매칭 확정 후에만 상대방에게 공개돼/)
  assert.doesNotMatch(photoUpload, /지금은 AI가 점수만 매겨/)
})

test('public score route does not return the raw appearance score', () => {
  const scoreRoute = readSource('app/api/score/route.ts')
  const successStart = scoreRoute.lastIndexOf('return NextResponse.json({')
  const successEnd = scoreRoute.indexOf('function scoreFailure', successStart)
  const successBody = scoreRoute.slice(successStart, successEnd)

  assert.doesNotMatch(successBody, /self_appearance_score:\s*resolved\.score/)
  assert.doesNotMatch(successBody, /self_appearance_score_auto:\s*autoScore/)
  assert.doesNotMatch(scoreRoute, /updateError\.(?:message|details)/)
})

test('appearance score API uses owned storage paths and persists only to the private score table', () => {
  const scoreRoute = readSource('app/api/score/route.ts')
  const persistence = readSource('lib/profile/appearance-score-persistence.ts')
  const pythonRoute = readSource('python/appearance/main.py')

  assert.match(scoreRoute, /\.from\('photos'\)/)
  assert.match(scoreRoute, /\.eq\('user_id', user\.id\)/)
  assert.match(scoreRoute, /\.order\('sort_order'\)/)
  assert.match(scoreRoute, /\.limit\(3\)/)
  assert.doesNotMatch(scoreRoute, /body\.photo_urls/)
  assert.match(scoreRoute, /createSignedUrl/)
  assert.match(scoreRoute, /APPEARANCE_SCORE_TABLE/)
  assert.match(persistence, /p_provider:\s*['"]openai['"]/)
  assert.match(persistence, /p_appearance_type:\s*result\.appearanceType/)
  assert.match(persistence, /p_score_raw:\s*result\.score/)
  assert.match(persistence, /p_anchor_version:\s*result\.anchorManifestVersion/)
  assert.match(scoreRoute, /photo_revision/)
  assert.match(scoreRoute, /\.from\(['"]profiles['"]\)/)
  assert.match(scoreRoute, /\.select\(['"]gender['"]\)/)
  assert.doesNotMatch(scoreRoute, /body\.gender_bank/)
  assert.doesNotMatch(scoreRoute, /public_url/)
  assert.match(scoreRoute, /['"]user_id['"][\s\S]{0,200}?['"]request_id['"]/)
  assert.match(pythonRoute, /AI_SERVER_SECRET/)
  assert.match(pythonRoute, /compare_digest/)

  assert.equal(isOwnedAppearanceStoragePath('user-1/photo_0.jpg', 'user-1'), true)
  assert.equal(isOwnedAppearanceStoragePath('user-1/photo_2.webp', 'user-1'), true)
  assert.equal(
    isOwnedAppearanceStoragePath(
      'user-1/550e8400-e29b-41d4-a716-446655440000-0.jpg',
      'user-1',
    ),
    true,
  )
  assert.equal(
    isOwnedAppearanceStoragePath(
      'user-1/550e8400-e29b-41d4-a716-446655440000-2.webp',
      'user-1',
    ),
    true,
  )
  assert.equal(
    isOwnedAppearanceStoragePath(
      'user-1/550e8400-e29b-41d4-a716-446655440000-3.jpg',
      'user-1',
    ),
    false,
  )
  assert.equal(isOwnedAppearanceStoragePath('user-1/not-a-uuid-0.jpg', 'user-1'), false)
  assert.equal(isOwnedAppearanceStoragePath('user-2/photo_0.jpg', 'user-1'), false)
  assert.equal(isOwnedAppearanceStoragePath('user-1/avatar.jpg', 'user-1'), false)
  assert.equal(
    isOwnedAppearanceStoragePath('https://attacker.example/user-1/photo_0.jpg', 'user-1'),
    false,
  )
})

test('deployment readiness requires the internal AI URL and shared secret', () => {
  const deployReadiness = readSource('scripts/check-deploy-readiness.mjs')

  assert.match(deployReadiness, /checkAiServerEnv/)
  assert.match(deployReadiness, /AI_SERVER_URL/)
  assert.match(deployReadiness, /AI_SERVER_SECRET/)

  assert.deepEqual(runAiEnvClassifiers(
    'https://ai.quantum-dating.kr',
    '0123456789abcdef0123456789abcdef',
  ), { url: 'SET', secret: 'SET' })

  for (const value of ['', '   ', 'https://   ', 'not-a-url', 'https://example.com']) {
    assert.notEqual(
      runAiEnvClassifiers(value, '0123456789abcdef0123456789abcdef').url,
      'SET',
    )
  }

  assert.notEqual(
    runAiEnvClassifiers('http://ai.quantum-dating.kr', '0123456789abcdef0123456789abcdef').url,
    'SET',
  )

  for (const value of ['', '   ', 'short', '                                ', 'replace_me_with_a_secure_shared_secret']) {
    assert.notEqual(runAiEnvClassifiers('https://ai.quantum-dating.kr', value).secret, 'SET')
  }
})

function runAiEnvClassifiers(url: string, secret: string): { url: string; secret: string } {
  const moduleUrl = pathToFileURL(join(ROOT, 'scripts/deploy-readiness-env.mjs')).href
  const source = [
    `import { classifyAiServerUrl, classifyAiServerSecret } from ${JSON.stringify(moduleUrl)};`,
    `console.log(JSON.stringify({ url: classifyAiServerUrl(${JSON.stringify(url)}), secret: classifyAiServerSecret(${JSON.stringify(secret)}) }));`,
  ].join('\n')
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: ROOT,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim()) as { url: string; secret: string }
}
