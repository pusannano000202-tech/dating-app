import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('advice routes parse bounded payloads and use the isolated scene RPC', async () => {
  const [queue, next] = await Promise.all([
    read('app/api/voice/advice/queue/route.ts'),
    read('app/api/voice/advice/next/route.ts'),
  ])
  assert.match(queue, /parseAdviceQueueInput/)
  assert.match(queue, /parseAdviceTopic/)
  assert.match(queue, /voiceSceneRpc\(request,\s*'advice_status'/)
  assert.match(queue, /`advice_\$\{input\.action\}`/)
  assert.match(next, /parseAdviceNextInput/)
  assert.match(next, /voiceSceneRpc\(request,\s*'advice_next'/)
  assert.match(next, /drainVoiceMediaOutbox\(\{ sessionId: input\.sessionId \}\)/)
  assert.match(next, /if \(!cleanup\.pending\)/)
  assert.match(next, /voiceSceneRpc\(request,\s*'advice_resume'/)
})

test('cheer route resolves the server catalog and requires a real voice provider', async () => {
  const source = await read('app/api/voice/cheer/rooms/route.ts')
  assert.match(source, /parseCheerJoinInput/)
  assert.match(source, /requireVoiceProvider\(\)/)
  assert.match(source, /voiceSceneRpc\(request,\s*'cheer_join'/)
  assert.doesNotMatch(source, /teamName:\s*b\./)
})

test('scene RPC reports an unapplied database contract without leaking provider details', async () => {
  const [server, client] = await Promise.all([
    read('lib/voice/server.ts'),
    read('lib/voice/client.ts'),
  ])
  assert.match(server, /community_voice_scene_command/)
  assert.match(server, /voice_scene_unavailable/)
  assert.match(client, /voice_scene_unavailable/)
})
