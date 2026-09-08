import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function model() {
  const path = 'lib/social/scene-navigation.ts'
  assert.ok(existsSync(path), 'shared photo scene navigation must exist')
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}
test('bounded photo navigation follows every card and clamps invalid indexes', async () => {
  const { sceneIndex } = await model()
  assert.equal(sceneIndex(0, -1, 4), 3)
  assert.equal(sceneIndex(3, 1, 4), 0)
  assert.equal(sceneIndex(0, 1, 7), 1)
  assert.equal(sceneIndex(NaN, 1, 4), 1)
  assert.equal(sceneIndex(0, 1, 0), 0)
})
test('vertical gestures do not change selected content', async () => {
  const { sceneSwipe } = await model()
  assert.equal(sceneSwipe(-80, 10), 1)
  assert.equal(sceneSwipe(80, 10), -1)
  assert.equal(sceneSwipe(20, 0), 0)
  assert.equal(sceneSwipe(60, 80), 0)
})
test('content adds places and uses a delivery scene rather than another cutlet photo', async () => {
  const { outputText } = ts.transpileModule(readFileSync('lib/community/experience-explorer.ts', 'utf8'), { compilerOptions:{module:ts.ModuleKind.ESNext} })
  const { COMMUNITY_EXPERIENCES: rows } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
  assert.deepEqual(rows.map(r=>r.id), ['visit','mbti','delivery','places'])
  assert.match(rows.find(r=>r.id==='delivery').image, /delivery/)
  assert.equal(rows.find(r=>r.id==='places').href, '/community/places')
  assert.equal(new Set(rows.map(r=>r.image)).size,4)
})
test('community gives the three axes equal editorial entry and preserves actual routes', () => {
  const source = readFileSync('app/community/page.tsx','utf8')
  assert.match(source,/CommunityPortal/)
  assert.ok(existsSync('app/community/content/page.tsx'))
  assert.ok(existsSync('app/community/stories/page.tsx'))
  const portal = readFileSync('components/community/CommunityPortal.tsx','utf8')
  for(const href of ['/community/content','/community/stories','/community/voice']) assert.ok(portal.includes(href))
})

test('photo surfaces request responsive optimized images instead of shipping full PNGs to every phone', () => {
  for(const file of ['components/social/PhotoSceneCarousel.tsx','components/community/CommunityPortal.tsx']) {
    const source=readFileSync(file,'utf8')
    assert.match(source,/from 'next\/image'/)
    assert.match(source,/sizes=/)
    assert.doesNotMatch(source,/<img\b/)
  }
})
