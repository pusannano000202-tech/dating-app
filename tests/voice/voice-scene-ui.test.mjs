import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('voice hub keeps live room data while adding the approved photo and team entry points', async () => {
  const source = await read('components/voice/VoiceHub.tsx')
  assert.match(source, /PhotoSceneCarousel/)
  for (const id of ['lck', 'kbo', 'football', 'romance', 'career', 'social', 'department'])
    assert.match(source, new RegExp(`id: '${id}'`))
  assert.match(source, /getCheerTeams\(league\)/)
  assert.match(source, /\/api\/voice\/cheer\/rooms/)
  assert.match(source, /\/api\/voice\/rooms/)
  assert.match(source, /adviceTopic=romance/)
  assert.match(source, /adviceTopic=career/)
  assert.match(source, /id: 'football'[\s\S]*disabled: true/)
  assert.match(source, /setSelectedTeamId\(null\)/)
  assert.match(source, /team\.name/)
  assert.match(source, /rulesConfirmed/)
  assert.match(source, /<details[^>]+id="official-rooms"/)
  assert.doesNotMatch(source, /className=\{s\.hero/)
})

test('worry matching requires a visible talker or listener choice', async () => {
  const source = await read('components/voice/VoiceRandom.tsx')
  const scenes = await read('components/voice/VoiceEntryScenes.tsx')
  const participation = await read('components/voice/VoiceParticipation.tsx')
  assert.match(source, /'talker'/)
  assert.match(source, /'listener'/)
  assert.match(source, /\/api\/voice\/advice\/queue/)
  assert.match(scenes, /내 이야기를 말할래요/)
  assert.match(scenes, /오늘은 들어줄래요/)
  assert.match(source, /adviceTopic/)
  assert.match(source, /rulesConfirmed/)
  assert.match(participation, /waiting\.genderBreakdown/)
})

test('session next uses atomic advice requeue and audio input is not the waiting pulse', async () => {
  const [source, provider, styles] = await Promise.all([
    read('components/voice/VoiceSessionView.tsx'),
    read('components/voice/VoiceGlobalProvider.tsx'),
    read('components/voice/voice.module.css'),
  ])
  assert.match(source, /session\.adviceRole/)
  assert.match(provider, /\/api\/voice\/advice\/next/)
  assert.match(provider, /localParticipant\.audioLevel/)
  assert.match(source, /s\.inputMeter/)
  assert.match(source, /s\.waitingPulse/)
  assert.match(source, /session\.adviceRole/)
  assert.match(styles, /\.inputMeter/)
  assert.match(styles, /\.waitingPulse/)
  assert.match(styles, /prefers-reduced-motion:\s*reduce/)
})

test('active sessions mount optional conversation cards after core call controls', async () => {
  const source = await read('components/voice/VoiceSessionView.tsx')
  assert.match(source, /VoiceConversationPrompts/)
  assert.match(source, /session\?\.state === 'active' && room/)
  assert.match(source, /key=\{`\$\{session\.id\}:\$\{room\.topic\}:\$\{room\.scope\}:\$\{session\.adviceRole/)
  assert.match(source, /topic=\{room\.topic\}/)
  assert.match(source, /scope=\{room\.scope\}/)
  assert.match(source, /adviceRole=\{session\.adviceRole\}/)
  assert.ok(source.indexOf('className={s.controls}') < source.indexOf('<VoiceConversationPrompts'))
})
