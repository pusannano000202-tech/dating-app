import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('expired reconnect ownership offers cleanup rather than an invalid call destination', async () => {
  const provider = await read('components/voice/VoiceGlobalProvider.tsx')
  const session = await read('components/voice/VoiceSessionView.tsx')
  const random = await read('components/voice/VoiceRandom.tsx')
  assert.match(provider, /const cleanupRequired = runtime.status === 'cleanup_required'/)
  assert.match(provider, /!cleanupRequired && <button[^\n]+openVoiceSession/)
  assert.match(provider, /만료된 연결 정리하기/)
  assert.match(provider, /next.status === 'cleanup_required'\)\) await disconnectLocal/)
  assert.match(session, /!ended && !cleanupRequired && session\?\.state === 'active'/)
  assert.match(random, /cleanupRequired && <button[^\n]+sessionCommand\('leave'\)/)
})

test('global voice runtime is server-owned, private, and explicitly granted', async () => {
  const migration = await read('supabase/migrations/20260908164745_voice_global_runtime.sql')
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /voice_advice_queue/)
  assert.match(migration, /voice_queue/)
  assert.match(migration, /voice_members/)
  assert.match(migration, /voice_sessions/)
  assert.match(migration, /sessionConnected/)
  assert.match(migration, /revoke all on function public\.community_voice_runtime_command/)
  assert.match(migration, /grant execute on function public\.community_voice_runtime_command\(text,jsonb\)\s+to authenticated/)
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/)
})

test('global provider owns polling and media while route components consume it', async () => {
  const [provider, random, session] = await Promise.all([
    read('components/voice/VoiceGlobalProvider.tsx'),
    read('components/voice/VoiceRandom.tsx'),
    read('components/voice/VoiceSessionView.tsx'),
  ])
  assert.match(provider, /\/api\/voice\/runtime/)
  assert.match(provider, /onAuthStateChange/)
  assert.match(provider, /Notification\.permission/)
  assert.match(provider, /aria-live="polite"/)
  assert.match(provider, /onPointerDown/)
  assert.match(provider, /onKeyDown/)
  assert.match(provider, /localParticipant\.setMicrophoneEnabled/)
  assert.doesNotMatch(provider, /setMicrophoneEnabled\(true\).*useEffect/s)
  assert.match(random, /useVoiceGlobal/)
  assert.doesNotMatch(random, /setInterval/)
  assert.match(session, /useVoiceGlobal/)
  assert.doesNotMatch(session, /new Room/)
  assert.doesNotMatch(session, /pagehide/)
})

test('runtime route delegates authenticated reads and exact mutations without trusting account ids', async () => {
  const source = await read('app/api/voice/runtime/route.ts')
  assert.match(source, /voiceRuntimeRpc\(request, 'status'\)/)
  assert.match(source, /parseVoiceRuntimeCommand/)
  assert.match(source, /voiceRuntimeRpc\(request, command\.action, command\)/)
  assert.doesNotMatch(source, /userId/)
})

test('global dock review fixture is offline-only and labels simulated connected audio', async () => {
  const [page, provider] = await Promise.all([
    read('app/community/voice/dev-global-runtime/page.tsx'),
    read('components/voice/VoiceGlobalProvider.tsx'),
  ])
  assert.match(page, /QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui'/)
  assert.match(page, /process\.env\.NODE_ENV === 'production'/)
  assert.match(page, /notFound\(\)/)
  assert.match(page, /VoiceGlobalDockFixture/)
  assert.match(provider, /보이스 UI 검수 · 예시 인원 · 실제 통화 아님/)
  assert.match(provider, /연결 상태 데모 · 실제 음성 연결 아님/)
})

test('global dock click and keyboard activation coexist with drag suppression', async () => {
  const provider = await read('components/voice/VoiceGlobalProvider.tsx')
  assert.match(provider, /suppressClick\.current = moved/)
  assert.match(provider, /onPointerCancel/)
  assert.match(provider, /onClick=\{\(\) => \{[\s\S]*?suppressClick\.current[\s\S]*?setOpen/)
})

test('connected copy distinguishes server participation from local media and explains aggregate totals', async () => {
  const [provider, random] = await Promise.all([
    read('components/voice/VoiceGlobalProvider.tsx'),
    read('components/voice/VoiceRandom.tsx'),
  ])
  assert.match(provider, /connection === 'connected'/)
  assert.match(provider, /서버 참여 상태는 유지 중이지만 이 기기의 음성은 연결되지 않았어요/)
  assert.match(provider, /otherOrUnspecifiedPeople/)
  assert.match(provider, /현재 연결/)
  assert.match(provider, /현재 대기/)
  assert.match(random, /connection === 'connected'/)
  assert.match(random, /이 기기의 음성은 연결되지 않았어요/)
})

test('dock closes its panel when runtime ownership disappears', async () => {
  const provider = await read('components/voice/VoiceGlobalProvider.tsx')
  const dock = provider.slice(provider.indexOf('export function VoiceGlobalDock()'))
  assert.match(dock, /if \(!runtime \|\| runtime\.status === 'idle'\) setOpen\(false\)/)
})

test('dock uses a stable server and client initial position before viewport fitting', async () => {
  const provider = await read('components/voice/VoiceGlobalProvider.tsx')
  const initial = provider.slice(
    provider.indexOf('function initialDockPosition()'),
    provider.indexOf('export function useVoiceGlobal'),
  )
  assert.match(initial, /return \{ x: 16, y: 96 \}/)
  assert.doesNotMatch(initial, /window/)
  assert.match(provider, /fit\(true\)/)
})

test('session commands navigate only after the global command returns a confirmed runtime', async () => {
  const session = await read('components/voice/VoiceSessionView.tsx')
  const command = session.slice(
    session.indexOf("async function command(action: VoiceCommand['action'])"),
    session.indexOf('  async function report('),
  )
  assert.match(command, /const result = await sessionCommand\(action\)/)
  const successGuard = command.indexOf('if (!result) return')
  assert.ok(successGuard >= 0)
  assert.ok(successGuard < command.indexOf("if (action === 'leave')"))
})

test('the default dock does not cover the open panel on desktop or short mobile viewports', async () => {
  const styles = await read('components/voice/voice-global.module.css')
  assert.match(styles, /\.panel\{[^}]*z-index:71[^}]*bottom:184px[^}]*max-height:calc\(100vh - 216px\)[^}]*overflow:auto/)
})

test('an unaccepted offer is labelled as review and rejection, not an active call', async () => {
  const provider = await read('components/voice/VoiceGlobalProvider.tsx')
  assert.match(provider, /const isProposedOffer =/)
  assert.match(provider, /isProposedOffer \? '대화 요청 확인하기'/)
  assert.match(provider, /isProposedOffer \? '요청 거절'/)
  assert.match(provider, /서로 수락했어요\. 통화 화면에서 이 기기의 음성을 연결해 주세요/)
})
// A deliberate sign-out gives the existing authenticated session a bounded cleanup window.
test('explicit sign-out attempts voice cleanup before revoking auth', async () => {
  const source = await read('app/auth/mfa/AdminMfaPanel.tsx')
  assert.ok(source.indexOf('await requestVoiceCleanupBeforeSignOut()') >= 0)
  assert.ok(source.indexOf('await requestVoiceCleanupBeforeSignOut()') < source.indexOf('await supabase.auth.signOut()'))
})
