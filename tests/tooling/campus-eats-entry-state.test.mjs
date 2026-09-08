import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = file => readFileSync(file, 'utf8')
async function policy() {
  const source = existsSync('lib/campus-eats/entry-policy.ts')
    ? read('lib/campus-eats/entry-policy.ts')
    : 'export ' + read('components/campus-eats/CampusEatsPilot.tsx').match(/function resolveAutoView\([\s\S]*?\n\}/)[0]
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}

test('fresh category entry opens preparation even when the previous tournament completed', async () => {
  const { resolveAutoView } = await policy()
  for (const status of ['completed', 'completed_without_winner', 'active', 'paused_needs_visits']) {
    const session = { status, winnerId: 'old-winner' }
    assert.equal(resolveAutoView({mode:'setup',categoryId:'pizza'}, 'pizza', session, true, 'result'), 'setup')
    assert.deepEqual(session, {status, winnerId:'old-winner'}, 'entry must not reset existing records')
  }
})

test('explicit battle URLs still resume active progress or show the saved result', async () => {
  const { resolveAutoView } = await policy()
  assert.equal(resolveAutoView({mode:'battle',categoryId:'chicken'},'chicken',{status:'active'},true,'battle'),'battle')
  assert.equal(resolveAutoView({mode:'battle',categoryId:'chicken'},'chicken',{status:'active'},true,'setup'),'battle')
  assert.equal(resolveAutoView({mode:'battle',categoryId:'chicken'},'chicken',{status:'completed'},true,'result'),'result')
  assert.equal(resolveAutoView({mode:'battle',categoryId:'pizza'},'chicken',{status:'completed'},true,'result'),'map')
  assert.equal(resolveAutoView({mode:'map',categoryId:'pizza'},'pizza',{status:'completed'},true,'result'),'map')
})

test('preparation URL remains preparation on reload rather than becoming battle', async () => {
  const { campusEatsModeForView } = await policy()
  assert.equal(typeof campusEatsModeForView, 'function')
  assert.equal(campusEatsModeForView('setup'), 'setup')
  assert.equal(campusEatsModeForView('battle'), 'battle')
  assert.equal(campusEatsModeForView('result'), 'battle')
  assert.equal(campusEatsModeForView('map'), 'map')
})

test('guide completion respects the requested next screen instead of reopening a completed result', () => {
  const source = read('components/campus-eats/CampusEatsPilot.tsx')
  assert.match(source, /setView\(battleGuideNextViewRef.current\)/)
  assert.match(source, /battleGuideNextViewRef.current = restoredView/)
})

test('category hydration only writes the matching scope and does not rehydrate on an equivalent API object', () => {
  const source = read('components/campus-eats/CampusEatsPilot.tsx')
  assert.match(source, /hydratedScopeRef.current === categoryScope/)
  assert.ok((source.match(/hydratedScope !== categoryScope/g) ?? []).length >= 2)
})

test('preparation exposes the selected food, change-food link and explicitly saved progress', () => {
  const source = read('components/campus-eats/CampusEatsPilot.tsx')
  assert.match(source, /다른 음식 고르기/)
  assert.match(source, /지난 결과 보기/)
  assert.match(source, /진행 중인 월드컵 이어하기/)
  assert.match(source, /\{category.label\}.*새 월드컵/)
})

test('initial or changing category never flashes the default donkatsu screen before hydration', () => {
  const source = read('components/campus-eats/CampusEatsPilot.tsx')
  assert.match(source, /if \(!hydrated \|\| hydratedScope !== categoryScope\) \{\s*return \([\s\S]*?role="status"/)
})

test('map category and school changes replace the old entry intent before hydration', () => {
  const source = read('components/campus-eats/CampusEatsPilot.tsx')
  for (const name of ['selectSchool', 'selectCategory']) {
    const handler = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n  }`))[0]
    assert.match(handler, /pendingDirectEntryRef.current = \{[\s\S]*?mode: 'map'/)
  }
})
