import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Git may check out CRLF on Windows; source-shape assertions use canonical LF.
const provider = (await readFile(
  new URL('../../components/voice/VoiceGlobalProvider.tsx', import.meta.url),
  'utf8',
)).replace(/\r\n/g, '\n')
const sessionView = (await readFile(
  new URL('../../components/voice/VoiceSessionView.tsx', import.meta.url),
  'utf8',
)).replace(/\r\n/g, '\n')

function between(startMarker, endMarker) {
  const start = provider.indexOf(startMarker)
  const end = provider.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, `${startMarker} must exist`)
  assert.ok(end > start, `${startMarker} must end before ${endMarker}`)
  return provider.slice(start, end)
}

test('the global owner detaches a room before awaiting provider disconnect', () => {
  const disconnect = between(
    'const disconnectLocal = useCallback(async () => {',
    '  const notifyOffer = useCallback',
  )
  assert.ok(disconnect.indexOf('roomRef.current = null') < disconnect.indexOf('await active.disconnect()'))
  assert.ok(disconnect.indexOf('roomSessionId.current = null') < disconnect.indexOf('await active.disconnect()'))
  assert.match(disconnect, /await active\.disconnect\(\)\.catch\(\(\) => undefined\)/)
  assert.ok(disconnect.indexOf('if (!mounted.current || roomRef.current) return') > disconnect.indexOf('await active.disconnect()'))
})

test('room callbacks reject stale ownership before changing media or connection UI', () => {
  for (const event of ['TrackSubscribed', 'ActiveSpeakersChanged', 'Reconnecting', 'Reconnected', 'Disconnected']) {
    const start = provider.indexOf(`active.on(RoomEvent.${event}`)
    const next = provider.indexOf('active.on(RoomEvent.', start + 25)
    const handler = provider.slice(start, next < 0 ? provider.indexOf('      try {', start) : next)
    assert.ok(start >= 0, `${event} handler must exist`)
    assert.match(handler, /roomRef\.current (?:!==|===) active/)
  }
})

test('runtime refresh aborts and sequences overlapping responses before publishing', () => {
  const refresh = between('const refresh = useCallback(async () => {', '  refreshRef.current = refresh')
  assert.match(refresh, /refreshController\.current\?\.abort\(\)/)
  assert.match(refresh, /const sequence = \+\+requestSequence\.current/)
  const firstGuard = refresh.indexOf('sequence !== requestSequence.current')
  assert.ok(firstGuard >= 0 && firstGuard < refresh.indexOf('publishRuntime(next)'))
  const unauthorized = refresh.slice(refresh.indexOf('if (response.status === 401'))
  assert.ok(
    unauthorized.indexOf('sequence !== requestSequence.current') <
      unauthorized.indexOf('publishRuntime(null)'),
  )
})

test('public pages fail closed without constructing an unconfigured Supabase client', () => {
  const effect = between('useEffect(() => {\n    mounted.current = true', '  const value = useMemo<VoiceGlobalContextValue>')
  assert.match(provider, /isSupabaseConfigured/)
  assert.ok(effect.indexOf('if (!isSupabaseConfigured())') < effect.indexOf('createClient()'))
  assert.match(effect, /try \{[\s\S]*?createClient\(\)[\s\S]*?\} catch/)
  assert.match(effect, /getUser\(\)[\s\S]*?\.catch/)
})

test('late initial auth lookup cannot overwrite a newer auth event', () => {
  const effect = between('useEffect(() => {\n    mounted.current = true', '  const value = useMemo<VoiceGlobalContextValue>')
  assert.match(effect, /let authRevision = 0/)
  assert.match(effect, /const initialAuthRevision = authRevision/)
  assert.match(effect, /authRevision !== initialAuthRevision/)
  const callback = effect.slice(effect.indexOf('onAuthStateChange'))
  assert.ok(callback.indexOf('authRevision += 1') < callback.indexOf('accountId.current = nextId'))
  assert.match(callback, /changed \|\| event === 'SIGNED_OUT' \|\| !nextId/)
})

test('account changes invalidate stale commands and clean local media immediately', () => {
  const effect = between('useEffect(() => {\n    mounted.current = true', '  const value = useMemo<VoiceGlobalContextValue>')
  assert.match(provider, /const operationSequence = useRef\(0\)/)
  const changed = effect.slice(effect.indexOf("if (changed || event === 'SIGNED_OUT' || !nextId)"))
  assert.match(changed, /operationSequence\.current \+= 1/)
  assert.match(changed, /busyRef\.current = false/)
  assert.match(changed, /void disconnectLocal\(\)/)
  assert.match(changed, /publishRuntime\(null\)/)
})

test('token and SDK awaits recheck account and session ownership before using media', () => {
  const connect = between('const connect = useCallback(async () => {', '  const toggleMic = useCallback')
  assert.match(connect, /runBusy\(async \(isCurrent\) =>/)
  assert.match(connect, /const connectAccountId = accountId\.current/)
  assert.match(connect, /const stillOwnsSession = \(\) =>/)
  assert.match(connect, /isCurrent\(\)/)
  const guards = connect.match(/if \(!stillOwnsSession\(\)\)/g) ?? []
  assert.ok(guards.length >= 3)
  assert.ok(connect.indexOf('try {') < connect.indexOf("voiceFetch<{"))
  assert.ok(connect.indexOf('if (!stillOwnsSession())') < connect.indexOf('const active = new Room('))
  assert.ok(connect.lastIndexOf('if (!stillOwnsSession())') > connect.indexOf('await active.startAudio()'))
  const failure = connect.slice(connect.indexOf('} catch (caught)'))
  assert.match(failure, /setConnection\('idle'\)/)
})

test('provider connection failures use fixed public copy instead of raw SDK details', () => {
  const connect = between('const connect = useCallback(async () => {', '  const toggleMic = useCallback')
  assert.match(provider, /VOICE_ERROR_COPY/)
  assert.match(provider, /getVoiceConnectErrorMessage/)
  assert.match(connect, /getVoiceConnectErrorMessage\(caught, Object\.values\(VOICE_ERROR_COPY\)\)/)
  assert.doesNotMatch(connect, /throw caught instanceof Error/)
})

test('in-app navigation preserves the provider room while browser exit performs cleanup', () => {
  assert.doesNotMatch(sessionView, /pagehide|beforeunload|active\.disconnect\(/)
  assert.match(provider, /window\.addEventListener\('pagehide', onPageHide\)/)
  assert.match(provider, /keepalive: true/)
  assert.match(provider, /voiceCommand\('leave', current\.session\.revision\)/)
})

test('microphone activation remains an explicit user action', () => {
  const toggle = between('const toggleMic = useCallback(async () => {', '  const openVoiceSession = useCallback')
  assert.match(toggle, /setMicrophoneEnabled\(enabling\)/)
  assert.doesNotMatch(provider.slice(0, provider.indexOf('const toggleMic = useCallback')), /setMicrophoneEnabled\(true\)/)
})

test('the pre-sign-out integration hook can be awaited by a logout owner', () => {
  assert.match(provider, /export async function requestVoiceCleanupBeforeSignOut/)
  assert.match(provider, /new Promise<void>/)
  assert.match(provider, /detail\?\.complete\(cleanup\)/)
  const signout = between('const beforeSignOut = (event: Event) => {', '    const onPageHide = () => {')
  assert.match(signout, /cleanVoiceBeforeSignOut/)
  assert.match(signout, /pending: pendingOperation.current/)
  assert.match(signout, /operationSequence.current === cleanupSequence/)
  assert.doesNotMatch(signout, /cancelWaiting\(\)|sessionCommand\('leave'\)/)
})

test('browser request notifications are emitted only for a still-proposed offer', () => {
  const notify = between('const notifyOffer = useCallback', '  const refreshRef = useRef')
  assert.match(notify, /next\.session\?\.state !== 'proposed'/)
})
