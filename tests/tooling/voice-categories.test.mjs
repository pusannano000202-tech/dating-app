import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

function model() {
  const path = 'lib/social/voice-discovery.ts'
  assert.ok(existsSync(path), 'voice discovery needs a purpose-based category model')
  const exports = {}
  new Function('exports', ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports)
  return exports
}

test('three purpose categories partition every existing voice theme exactly once', () => {
  const { VOICE_CATEGORIES } = model()
  assert.deepEqual(VOICE_CATEGORIES.map(c => [c.id, c.sceneIds]), [
    ['cheer', ['lck', 'kbo', 'football']],
    ['conversation', ['romance', 'career', 'social']],
    ['department', ['department']],
  ])
  assert.equal(new Set(VOICE_CATEGORIES.flatMap(c => c.sceneIds)).size, 7)
  assert.deepEqual(VOICE_CATEGORIES.map(c => c.label), ['응원하기', '이야기 나누기', '우리 학과'])
})

test('only the selected category scenes remain and original links/actions are preserved', () => {
  const { getVoiceCategoryScenes } = model()
  const callback = () => 'existing-action'
  const scenes = ['lck', 'kbo', 'football', 'romance', 'career', 'social', 'department'].map(id => ({ id, href: '/'+id, onSelect: callback }))
  for (const [category, expected] of [['cheer', ['lck','kbo','football']], ['conversation', ['romance','career','social']], ['department', ['department']]]) {
    const selected = getVoiceCategoryScenes(scenes, category)
    assert.deepEqual(selected.map(s => s.id), expected)
    for (const scene of selected) assert.equal(scene, scenes.find(s => s.id === scene.id))
  }
  assert.deepEqual(getVoiceCategoryScenes([], 'cheer'), [])
  assert.equal(scenes.length, 7)
})

test('hub exposes a separate category selector and resets old detail state on switch', () => {
  const hub = readFileSync('components/voice/VoiceHub.tsx', 'utf8')
  assert.match(hub, /aria-label="보이스 카테고리"/)
  assert.match(hub, /getVoiceCategoryScenes\(VOICE_SCENES, category\)/)
  assert.match(hub, /key=\{category\}/)
  assert.match(hub, /showNavigation=\{scenes\.length > 1\}/)
  const switcher = hub.match(/function chooseCategory\([\s\S]*?\n  \}/)?.[0] ?? ''
  for (const setter of ['setCategory', 'setCheerOpen(false)', 'setOfficialOpen(false)', 'setSelectedTeamId(null)', 'setRulesConfirmed(false)', "setJoinError('')"]) assert.ok(switcher.includes(setter), setter)
})

test('single-scene mode can hide misleading carousel navigation without changing the default', () => {
  const source = readFileSync('components/social/PhotoSceneCarousel.tsx', 'utf8')
  assert.match(source, /showNavigation = true/)
  assert.match(source, /showNavigation\?: boolean/)
  assert.match(source, /showNavigation && <div className=\{s\.choices\}/)
  assert.match(source, /showNavigation && <div className=\{s\.arrows\}/)
  assert.match(source, /showNavigation && <span className=\{s\.photoTag\}/)
})
