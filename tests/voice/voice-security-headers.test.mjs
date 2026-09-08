import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {resolveVoiceConnectSources} from '../../lib/voice/security-headers.mjs'
test('voice connection origins reject injection and insecure remote providers',()=>{
 assert.deepEqual(resolveVoiceConnectSources({LIVEKIT_URL:'wss://project.livekit.cloud'},true),['wss://project.livekit.cloud','https://project.livekit.cloud'])
 assert.deepEqual(resolveVoiceConnectSources({LIVEKIT_URL:'ws://127.0.0.1:7880'},true),[])
 assert.deepEqual(resolveVoiceConnectSources({LIVEKIT_URL:'ws://127.0.0.1:7880'},false),['ws://127.0.0.1:7880','http://127.0.0.1:7880'])
 assert.deepEqual(resolveVoiceConnectSources({LIVEKIT_URL:'wss://x.example; *'},true),[])
 assert.deepEqual(resolveVoiceConnectSources({LIVEKIT_URL:'wss://user:pass@x.example'},true),[])
})
test('microphone is browser-permission controlled, worker is scheduled and authenticates Vercel GET',async()=>{
 const config=await readFile(new URL('../../next.config.mjs',import.meta.url),'utf8')
 const crons=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')).crons
 const worker=await readFile(new URL('../../app/api/internal/voice/reconcile/route.ts',import.meta.url),'utf8')
 assert.match(config,/microphone=\(self\)/)
 assert.match(config,/voiceConnections/)
 assert.ok(crons.some(c=>c.path==='/api/internal/voice/reconcile'&&c.schedule==='* * * * *'))
 assert.match(worker,/export.*GET/)
 assert.match(worker,/CRON_SECRET/)
 assert.match(worker,/timingSafeEqual/)
})
