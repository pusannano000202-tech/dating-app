import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const commandCenterPath = path.join(
  process.cwd(),
  'components/matching/QuantumParticipationCommandCenter.tsx',
)

test('one command center covers every participant-facing event state', () => {
  assert.ok(fs.existsSync(commandCenterPath), 'command center component must exist')
  const component = fs.readFileSync(commandCenterPath, 'utf8')

  for (const state of [
    'recruiting',
    'confirmed',
    'chat_open',
    'in_progress',
    'cancelled',
    'completed',
  ]) {
    assert.match(component, new RegExp(`['\"]${state}['\"]`))
  }

  assert.match(component, /participant_counts/)
  assert.match(component, /party_members/)
  assert.match(component, /채팅/)
  assert.match(component, /후기/)
  assert.match(component, /취소/)
  assert.match(component, /user_cancelled/)
  assert.match(component, /choose=another/)
  assert.match(component, /aria-live="polite"/)
  assert.match(component, /role="progressbar"/)
  assert.match(component, /\/match\/events\//)
  assert.doesNotMatch(component, /return `\/match\/\$\{matchId\}`/)
  assert.match(component, /getUTCHours/)
  assert.doesNotMatch(component, /Intl\.DateTimeFormat/)
})

test('home and match discovery use the same participant command center', () => {
  const home = fs.readFileSync(
    path.join(process.cwd(), 'components/home/QuantumHomeParticipation.tsx'),
    'utf8',
  )
  const wheel = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx'),
    'utf8',
  )

  assert.match(home, /QuantumParticipationCommandCenter/)
  assert.match(wheel, /QuantumParticipationCommandCenter/)
  assert.match(wheel, /min-h-\[56px\]/)
  assert.match(wheel, /active:scale-95/)
  assert.match(wheel, /deriveQuantumEventLifecycleStage/)
  assert.match(wheel, /participationLocked/)
  assert.match(wheel, /chooseAnother/)
  assert.match(wheel, /onKeyDown/)
  assert.match(wheel, /Escape/)
  assert.match(home, /status === 'error'/)
})

test('dev lifecycle preview keeps fixture states outside production APIs', () => {
  const previewPath = path.join(
    process.cwd(),
    'app/dev/event-lifecycle-preview/page.tsx',
  )
  assert.ok(fs.existsSync(previewPath), 'dev lifecycle preview must exist')
  const preview = fs.readFileSync(previewPath, 'utf8')

  assert.match(preview, /process\.env\.NODE_ENV/)
  assert.match(preview, /QuantumParticipationCommandCenter/)
  assert.match(preview, /미리보기/)
})
