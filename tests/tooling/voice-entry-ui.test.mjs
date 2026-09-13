import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

test('voice entry uses the chosen role-photo design instead of the headphone orb', () => {
  const source = readFileSync('components/voice/VoiceRandom.tsx', 'utf8')
  const provider = readFileSync('components/voice/VoiceGlobalProvider.tsx', 'utf8')
  assert.match(source, /VoiceEntryScenes/)
  assert.match(source, /VoiceParticipation/)
  assert.doesNotMatch(source, /s\.orb|s\.people/)
  assert.match(source, /createVoiceEntryLoader/)
  assert.match(source, /useVoiceGlobal\(\)/)
  assert.match(source, /parseVoiceQueueIdentity\(acknowledgement\)/)
  assert.match(source, /await refreshGlobal\(\)/)
  assert.match(source, /await cancelWaiting\(\)/)
  assert.match(source, /finally\s*\{[\s\S]*setBusy\(false\)[\s\S]*void loaderRef\.current\?\.refresh\(\)/)
  assert.match(source, /router\.push\('\/community\/voice\/session\/' \+ confirmed\.sessionId\)/)
  assert.doesNotMatch(source, /setInterval/)
  assert.match(provider, /\/api\/voice\/runtime/)
  assert.match(source, /rulesConfirmed/)
  assert.match(source, /\/api\/voice\/advice\/queue/)
})

test('role photos and topic rail have explicit selectable and scrollable controls', () => {
  assert.ok(existsSync('components/voice/VoiceEntryScenes.tsx'))
  const source = readFileSync('components/voice/VoiceEntryScenes.tsx', 'utf8')
  assert.match(source, /voice-talker-v2\.webp/)
  assert.match(source, /voice-listener-v2\.webp/)
  assert.match(source, /aria-pressed/)
  assert.match(source, /scrollTo/)
  assert.match(source, /focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /\}, \[selected\]\)/)
  assert.match(source, /role="group"/)
  const css = readFileSync('components/voice/voice-entry.module.css', 'utf8')
  assert.match(css, /overflow-x:\s*auto/)
  assert.match(css, /\.roles\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s)
  assert.match(css, /prefers-reduced-motion/)
})

test('count surface keeps explicit waiting scope, real gender totals and retry without fake activity', () => {
  assert.ok(existsSync('components/voice/VoiceParticipation.tsx'))
  const source = readFileSync('components/voice/VoiceParticipation.tsx', 'utf8')
  for (const field of ['totalPeople', 'malePeople', 'femalePeople', 'otherOrUnspecifiedPeople', 'asOf']) assert.match(source, new RegExp(field))
  assert.match(source, /대기 현황/)
  assert.match(source, /다시 확인/)
  assert.match(source, /현황 확인 중/)
  assert.doesNotMatch(source, /Math\.random|\|\|\s*0|\?\?\s*0/)
})
