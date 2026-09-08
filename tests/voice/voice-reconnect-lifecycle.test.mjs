import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(
  new URL('../../components/voice/VoiceSessionView.tsx', import.meta.url),
  'utf8',
)

test('an unexpected disconnect releases only the room that emitted it', () => {
  const handler = source.match(
    /active\.on\(RoomEvent\.Disconnected, \(\) => \{([\s\S]*?)\n\s*\}\)/,
  )?.[1]

  assert.ok(handler, 'the disconnected handler must exist')
  assert.match(handler, /if \(!releaseCurrentVoiceRoom\(media, active\)\) return/)
  assert.ok(
    handler.indexOf('releaseCurrentVoiceRoom(media, active)') <
      handler.indexOf("setConnection('idle')"),
    'a stale room must not reset the state of a newer connection',
  )
})

test('explicit leave detaches the room before provider disconnect callbacks run', () => {
  const callback = source.match(
    /const disconnect = useCallback\(async \([\s\S]*?\) => \{([\s\S]*?)\n\s*\}, \[stopInputMeter\]\)/,
  )?.[1]

  assert.ok(callback, 'the explicit disconnect callback must exist')
  assert.match(callback, /releaseCurrentVoiceRoom\(media, active\)/)
  assert.ok(
    callback.indexOf('releaseCurrentVoiceRoom(media, active)') <
      callback.indexOf('await active.disconnect()'),
    'leave and unmount must make a later disconnect event stale',
  )
})

test('an old explicit disconnect cannot reset a new session after provider cleanup resolves', () => {
  const callback = source.match(
    /const disconnect = useCallback\(async \([\s\S]*?\) => \{([\s\S]*?)\n\s*\}, \[stopInputMeter\]\)/,
  )?.[1]

  assert.ok(callback, 'the explicit disconnect callback must exist')
  const providerAwait = callback.indexOf('await active.disconnect()')
  const epochGuard = callback.indexOf('canFinalizeVoiceDisconnect(', providerAwait)
  const roomGuard = callback.indexOf('media,', epochGuard)
  const uiReset = callback.indexOf("setConnection('idle')")
  const audioReset = callback.indexOf('audioRoot.current?.replaceChildren()')

  assert.ok(providerAwait >= 0, 'provider disconnect must be awaited')
  assert.ok(epochGuard > providerAwait, 'UI ownership must be rechecked after the await')
  assert.ok(roomGuard > epochGuard, 'the finalizer must inspect current room ownership')
  assert.ok(uiReset > roomGuard, 'old cleanup must not reset new connection state')
  assert.ok(audioReset > roomGuard, 'old cleanup must not remove new audio elements')
  assert.doesNotMatch(callback, /setBusy\(/, 'disconnect must not overwrite new busy state')
})

test('provider disconnect failures are contained before public command error handling', () => {
  const callback = source.match(
    /const disconnect = useCallback\(async \([\s\S]*?\) => \{([\s\S]*?)\n\s*\}, \[stopInputMeter\]\)/,
  )?.[1]

  assert.ok(callback, 'the explicit disconnect callback must exist')
  assert.match(
    callback,
    /await active\.disconnect\(\)\.catch\(\(\) => undefined\)/,
    'SDK disconnect errors must not escape into voiceFetch error copy or skip local cleanup',
  )
  assert.ok(
    callback.indexOf('active.disconnect().catch') <
      callback.indexOf('canFinalizeVoiceDisconnect('),
    'local ownership finalization must continue after a provider disconnect failure',
  )
})

test('session effect invalidates old async work and initializes the new session UI', () => {
  const effect = source.match(
    /useEffect\(\(\) => \{([\s\S]*?)\n\s*\}, \[refresh, disconnect, sessionId\]\)/,
  )?.[1]

  assert.ok(effect, 'the session effect must exist')
  assert.match(effect, /const effectEpoch = sessionEpoch\.current \+ 1/)
  assert.match(effect, /sessionEpoch\.current = effectEpoch/)
  assert.match(effect, /void refresh\(effectEpoch\)/)
  assert.match(effect, /setInterval\(\(\) => void refresh\(effectEpoch\), 5000\)/)
  assert.match(effect, /void disconnect\(effectEpoch\)/)
  assert.match(effect, /sessionEpoch\.current \+= 1/)
  assert.match(effect, /latest\.current = null/)
  for (const reset of [
    'setSession(null)',
    'setRoom(null)',
    "setError('')",
    "setBusy(false)",
    "setConnection('idle')",
    'setMic(false)',
    'setSpeakers([])',
  ]) {
    assert.match(effect, new RegExp(reset.replace(/[()[\]]/g, '\\$&')))
  }
})

test('a refresh from an old session cannot replace new session data or disconnect its room', () => {
  const refreshStart = source.indexOf('const refresh = useCallback(')
  const effectStart = source.indexOf('  useEffect(() => {', refreshStart)
  const refresh = source.slice(refreshStart, effectStart)

  assert.ok(refreshStart >= 0 && effectStart > refreshStart)
  assert.match(
    refresh,
    /async \(refreshEpoch = sessionEpoch\.current\)/,
  )
  assert.match(refresh, /const requestSequence = refreshSequence\.current \+ 1/)
  assert.match(refresh, /refreshSequence\.current = requestSequence/)
  assert.match(
    refresh,
    /isCurrentVoiceRefresh\(\s*sessionEpoch,\s*refreshEpoch,\s*refreshSequence,\s*requestSequence,\s*alive\.current,?\s*\)/,
  )
  assert.ok(
    refresh.indexOf('isCurrentVoiceRefresh(') <
      refresh.indexOf('latest.current && latest.current.generation'),
    'an out-of-order same-session response must be rejected before generation cleanup',
  )
  const epochGuards = refresh.match(
    /isCurrentVoiceRefresh\(\s*sessionEpoch,\s*refreshEpoch,\s*refreshSequence,\s*requestSequence,\s*alive\.current,?\s*\)/g,
  ) ?? []
  assert.ok(
    epochGuards.length >= 3,
    'fetch success, post-disconnect continuation, and catch must recheck the session epoch',
  )
  assert.match(refresh, /await disconnect\(refreshEpoch\)/)
  assert.ok(
    refresh.indexOf('isCurrentVoiceRefresh(') < refresh.indexOf('latest.current = d.session'),
    'old data must be rejected before it reaches session state',
  )
  const failure = refresh.slice(refresh.indexOf('    } catch (e) {'))
  assert.ok(
    failure.indexOf('isCurrentVoiceRefresh(') < failure.indexOf('setError('),
    'old refresh errors must be rejected before changing the new session UI',
  )
})

function asyncFunctionBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, `${startMarker} must exist`)
  assert.ok(end > start, `${startMarker} must end before ${endMarker}`)
  return source.slice(start, end)
}

test('old command completion cannot refresh, route, error, or unlock the new session', () => {
  const command = asyncFunctionBetween(
    'async function command(',
    '  async function connect()',
  )

  assert.match(command, /const commandEpoch = sessionEpoch\.current/)
  assert.match(command, /await disconnect\(commandEpoch\)/)
  assert.match(command, /await refresh\(commandEpoch\)/)
  const guards = command.match(
    /isCurrentVoiceSessionEpoch\(\s*sessionEpoch,\s*commandEpoch,\s*alive\.current,?\s*\)/g,
  ) ?? []
  assert.ok(guards.length >= 4, 'command awaits and catch/finally must retain epoch ownership')
  assert.ok(command.indexOf('isCurrentVoiceSessionEpoch(') < command.indexOf('router.replace('))
  const commandCatch = command.slice(command.indexOf('    } catch (e) {'))
  assert.ok(commandCatch.indexOf('isCurrentVoiceSessionEpoch(') < commandCatch.indexOf('setError('))
  const commandFinally = command.slice(command.indexOf('    } finally {'))
  assert.ok(commandFinally.indexOf('isCurrentVoiceSessionEpoch(') < commandFinally.indexOf('setBusy(false)'))
})

test('old microphone completion and meter loop cannot alter the new session', () => {
  const toggle = asyncFunctionBetween(
    'async function toggleMic()',
    '  async function report(',
  )

  assert.match(toggle, /const toggleEpoch = sessionEpoch\.current/)
  assert.match(toggle, /const active = media\.current/)
  assert.match(toggle, /active\.localParticipant\.setMicrophoneEnabled/)
  assert.match(
    toggle,
    /isCurrentVoiceSessionEpoch\(\s*sessionEpoch,\s*toggleEpoch,\s*alive\.current,?\s*\)/,
  )
  assert.match(toggle, /isCurrentVoiceRoom\(media, active, alive\.current\)/)
  const toggleCatch = toggle.slice(toggle.indexOf('    } catch'))
  assert.ok(toggleCatch.indexOf('isCurrentVoiceSessionEpoch(') < toggleCatch.indexOf('setError('))
  const toggleFinally = toggle.slice(toggle.indexOf('    } finally {'))
  assert.ok(toggleFinally.indexOf('isCurrentVoiceSessionEpoch(') < toggleFinally.indexOf('setBusy(false)'))
})

test('old report completion cannot mark, route, error, or unlock the new session', () => {
  const report = asyncFunctionBetween(
    'async function report(',
    '  const ended =',
  )

  assert.match(report, /const reportEpoch = sessionEpoch\.current/)
  assert.match(report, /await disconnect\(reportEpoch\)/)
  const guards = report.match(
    /isCurrentVoiceSessionEpoch\(\s*sessionEpoch,\s*reportEpoch,\s*alive\.current,?\s*\)/g,
  ) ?? []
  assert.ok(guards.length >= 3, 'report completion, catch, and finally must retain epoch ownership')
  assert.ok(report.indexOf('isCurrentVoiceSessionEpoch(') < report.indexOf('setReportDone(true)'))
  const reportCatch = report.slice(report.indexOf('    } catch (e) {'))
  assert.ok(reportCatch.indexOf('isCurrentVoiceSessionEpoch(') < reportCatch.indexOf('setError('))
  const reportFinally = report.slice(report.indexOf('    } finally {'))
  assert.ok(reportFinally.indexOf('isCurrentVoiceSessionEpoch(') < reportFinally.indexOf('setBusy(false)'))
})

function handlerBetween(event, nextEvent) {
  const start = source.indexOf(`active.on(RoomEvent.${event}`)
  const end = source.indexOf(`active.on(RoomEvent.${nextEvent}`, start + 1)
  assert.ok(start >= 0, `${event} handler must exist`)
  assert.ok(end > start, `${event} handler must end before ${nextEvent}`)
  return source.slice(start, end)
}

test('stale room media and connection callbacks cannot update audio or UI', () => {
  for (const [event, nextEvent] of [
    ['TrackSubscribed', 'TrackUnsubscribed'],
    ['ActiveSpeakersChanged', 'Reconnecting'],
    ['Reconnecting', 'Reconnected'],
    ['Reconnected', 'Disconnected'],
  ]) {
    const handler = handlerBetween(event, nextEvent)
    assert.match(
      handler,
      /!isCurrentVoiceRoom\(media, active, alive\.current\)/,
      `${event} must reject callbacks from an old room or an unmounted view`,
    )
    assert.match(
      handler,
      /!isCurrentVoiceSessionEpoch\(\s*sessionEpoch,\s*connectEpoch,\s*alive\.current,?\s*\)/,
      `${event} must reject callbacks from an earlier session epoch`,
    )
  }
})

test('stale async connect completion and failure cannot overwrite a newer room', () => {
  const connectStart = source.indexOf('async function connect()')
  const catchStart = source.indexOf('    } catch (e) {', connectStart)
  const finallyStart = source.indexOf('    } finally {', catchStart)
  assert.ok(connectStart >= 0 && catchStart > connectStart && finallyStart > catchStart)

  const completion = source.slice(connectStart, catchStart)
  const failure = source.slice(catchStart, finallyStart)
  const completionGuards = completion.match(
    /isCurrentVoiceRoom\(media, active, alive\.current\)/g,
  ) ?? []

  assert.ok(completionGuards.length >= 2, 'connect and startAudio completion must both recheck room identity')
  assert.match(failure, /isCurrentVoiceRoom\(media, active, alive\.current\)/)
  assert.match(failure, /releaseCurrentVoiceRoom\(media, active\)/)
  assert.doesNotMatch(failure, /media\.current\s*=\s*null/)
  assert.ok(
    failure.indexOf('isCurrentVoiceRoom(media, active, alive.current)') <
      failure.indexOf("setConnection('idle')"),
    'failure must prove it still owns the UI before resetting state',
  )
})

test('token and SDK awaits recheck session epoch before a Room is created', () => {
  const connectStart = source.indexOf('async function connect()')
  const roomCreation = source.indexOf('active = new Room(', connectStart)
  const beforeRoom = source.slice(connectStart, roomCreation)

  assert.ok(connectStart >= 0 && roomCreation > connectStart)
  assert.match(beforeRoom, /const connectEpoch = sessionEpoch\.current/)
  const epochGuards = beforeRoom.match(
    /isCurrentVoiceSessionEpoch\(\s*sessionEpoch,\s*connectEpoch,\s*alive\.current,?\s*\)/g,
  ) ?? []
  assert.ok(
    epochGuards.length >= 2,
    'token and dynamic import completion must each reject an old session',
  )
})

test('old connect catch and finally cannot alter the new session error or busy state', () => {
  const connectStart = source.indexOf('async function connect()')
  const catchStart = source.indexOf('    } catch (e) {', connectStart)
  const finallyStart = source.indexOf('    } finally {', catchStart)
  const connectEnd = source.indexOf('\n  }\n  async function toggleMic', finallyStart)
  const failure = source.slice(catchStart, finallyStart)
  const finalizer = source.slice(finallyStart, connectEnd)

  assert.match(
    failure,
    /isCurrentVoiceSessionEpoch\(\s*sessionEpoch,\s*connectEpoch,\s*alive\.current,?\s*\)/,
  )
  assert.ok(
    failure.indexOf('isCurrentVoiceSessionEpoch(') < failure.indexOf('setError('),
    'catch must prove session ownership before changing public error state',
  )
  assert.match(
    finalizer,
    /isCurrentVoiceSessionEpoch\(\s*sessionEpoch,\s*connectEpoch,\s*alive\.current,?\s*\)/,
  )
  assert.ok(
    finalizer.indexOf('isCurrentVoiceSessionEpoch(') < finalizer.indexOf('setBusy(false)'),
    'finally must prove session ownership before releasing the new session busy state',
  )
})

test('provider connection failures use fixed public copy instead of raw SDK details', () => {
  const connectStart = source.indexOf('async function connect()')
  const catchStart = source.indexOf('    } catch (e) {', connectStart)
  const finallyStart = source.indexOf('    } finally {', catchStart)
  const failure = source.slice(catchStart, finallyStart)

  assert.match(source, /VOICE_ERROR_COPY/)
  assert.match(failure, /getVoiceConnectErrorMessage\(e, Object\.values\(VOICE_ERROR_COPY\)\)/)
  assert.doesNotMatch(failure, /e\.message\.length|\? e\.message/)
})
