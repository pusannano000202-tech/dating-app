import test from 'node:test'
import assert from 'node:assert/strict'
import * as mediaLifecycle from '../../lib/voice/media-lifecycle'

const { releaseCurrentVoiceRoom } = mediaLifecycle

test('an unexpected disconnect releases the current room so reconnect can start', () => {
  const room = { id: 'first' }
  const slot = { current: room }

  assert.equal(releaseCurrentVoiceRoom(slot, room), true)
  assert.equal(slot.current, null)
})

test('a stale disconnect from an old room cannot release the newer room', () => {
  const oldRoom = { id: 'old' }
  const newRoom = { id: 'new' }
  const slot = { current: newRoom }

  assert.equal(releaseCurrentVoiceRoom(slot, oldRoom), false)
  assert.equal(slot.current, newRoom)
})

test('explicit leave or unmount can release the same room repeatedly', () => {
  const room = { id: 'current' }
  const slot: { current: typeof room | null } = { current: room }

  assert.equal(releaseCurrentVoiceRoom(slot, room), true)
  assert.equal(releaseCurrentVoiceRoom(slot, room), false)
  assert.equal(slot.current, null)
})

test('room callbacks may update UI only for the alive current room', () => {
  const isCurrentVoiceRoom = (
    mediaLifecycle as unknown as {
      isCurrentVoiceRoom?: <T>(
        slot: { current: T | null },
        room: T,
        alive: boolean,
      ) => boolean
    }
  ).isCurrentVoiceRoom

  assert.equal(typeof isCurrentVoiceRoom, 'function')

  const oldRoom = { id: 'old' }
  const currentRoom = { id: 'current' }
  const slot = { current: currentRoom }
  assert.equal(isCurrentVoiceRoom?.(slot, currentRoom, true), true)
  assert.equal(isCurrentVoiceRoom?.(slot, oldRoom, true), false)
  assert.equal(isCurrentVoiceRoom?.(slot, currentRoom, false), false)
})

test('async voice work may update only the session epoch that started it', () => {
  const isCurrentVoiceSessionEpoch = (
    mediaLifecycle as unknown as {
      isCurrentVoiceSessionEpoch?: (
        slot: { current: number },
        expectedEpoch: number,
        alive: boolean,
      ) => boolean
    }
  ).isCurrentVoiceSessionEpoch

  assert.equal(typeof isCurrentVoiceSessionEpoch, 'function')

  const epoch = { current: 4 }
  assert.equal(isCurrentVoiceSessionEpoch?.(epoch, 4, true), true)
  assert.equal(isCurrentVoiceSessionEpoch?.(epoch, 3, true), false)
  assert.equal(isCurrentVoiceSessionEpoch?.(epoch, 4, false), false)
})

test('an old disconnect cannot finalize UI after a new session or room takes ownership', async () => {
  const canFinalizeVoiceDisconnect = (
    mediaLifecycle as unknown as {
      canFinalizeVoiceDisconnect?: <T>(
        roomSlot: { current: T | null },
        epochSlot: { current: number },
        expectedEpoch: number,
        alive: boolean,
      ) => boolean
    }
  ).canFinalizeVoiceDisconnect

  assert.equal(typeof canFinalizeVoiceDisconnect, 'function')

  const oldRoom = { id: 'old' }
  const newRoom = { id: 'new' }
  const roomSlot: { current: typeof oldRoom | null } = { current: oldRoom }
  const epochSlot = { current: 1 }
  const ui = {
    connection: 'connected',
    mic: true,
    speakers: ['new-speaker'],
    audioChildren: 1,
    busy: true,
  }
  let finishProviderDisconnect!: () => void
  const providerDisconnect = new Promise<void>((resolve) => {
    finishProviderDisconnect = resolve
  })

  releaseCurrentVoiceRoom(roomSlot, oldRoom)
  const oldCleanup = (async () => {
    await providerDisconnect
    if (canFinalizeVoiceDisconnect?.(roomSlot, epochSlot, 1, true)) {
      ui.connection = 'idle'
      ui.mic = false
      ui.speakers = []
      ui.audioChildren = 0
      ui.busy = false
    }
  })()

  epochSlot.current = 2
  roomSlot.current = newRoom
  finishProviderDisconnect()
  await oldCleanup

  assert.deepEqual(ui, {
    connection: 'connected',
    mic: true,
    speakers: ['new-speaker'],
    audioChildren: 1,
    busy: true,
  })

  roomSlot.current = null
  assert.equal(canFinalizeVoiceDisconnect?.(roomSlot, epochSlot, 1, true), false)
  assert.equal(canFinalizeVoiceDisconnect?.(roomSlot, epochSlot, 2, true), true)
})

test('a deferred refresh from the old epoch cannot replace the new session or disconnect its room', async () => {
  const isCurrentVoiceSessionEpoch = (
    mediaLifecycle as unknown as {
      isCurrentVoiceSessionEpoch: (
        slot: { current: number },
        expectedEpoch: number,
        alive: boolean,
      ) => boolean
    }
  ).isCurrentVoiceSessionEpoch
  const epochSlot = { current: 1 }
  let shownSession = 'old-session'
  let currentRoom = 'old-room'
  let disconnectedRoom: string | null = null
  let resolveOldRefresh!: (value: { session: string; generation: number }) => void
  const oldResponse = new Promise<{ session: string; generation: number }>(
    (resolve) => {
      resolveOldRefresh = resolve
    },
  )

  const refresh = async (refreshEpoch: number) => {
    const response = await oldResponse
    if (!isCurrentVoiceSessionEpoch(epochSlot, refreshEpoch, true)) return
    if (response.generation !== 2) disconnectedRoom = currentRoom
    shownSession = response.session
  }

  const pendingOldRefresh = refresh(1)
  epochSlot.current = 2
  shownSession = 'new-session'
  currentRoom = 'new-room'
  resolveOldRefresh({ session: 'old-session-response', generation: 1 })
  await pendingOldRefresh

  assert.equal(shownSession, 'new-session')
  assert.equal(currentRoom, 'new-room')
  assert.equal(disconnectedRoom, null)
})

test('a later refresh wins when same-session responses resolve out of order', async () => {
  const isCurrentVoiceRefresh = (
    mediaLifecycle as unknown as {
      isCurrentVoiceRefresh?: (
        epochSlot: { current: number },
        expectedEpoch: number,
        sequenceSlot: { current: number },
        expectedSequence: number,
        alive: boolean,
      ) => boolean
    }
  ).isCurrentVoiceRefresh

  assert.equal(typeof isCurrentVoiceRefresh, 'function')

  const epochSlot = { current: 2 }
  const sequenceSlot = { current: 0 }
  let shownGeneration = 0
  let currentRoom = 'waiting-room'
  let disconnectedRoom: string | null = null
  let resolveFirst!: (generation: number) => void
  let resolveSecond!: (generation: number) => void
  const firstResponse = new Promise<number>((resolve) => {
    resolveFirst = resolve
  })
  const secondResponse = new Promise<number>((resolve) => {
    resolveSecond = resolve
  })

  const refresh = async (response: Promise<number>) => {
    const requestSequence = sequenceSlot.current + 1
    sequenceSlot.current = requestSequence
    const generation = await response
    if (
      !isCurrentVoiceRefresh?.(
        epochSlot,
        2,
        sequenceSlot,
        requestSequence,
        true,
      )
    )
      return
    if (shownGeneration !== generation) disconnectedRoom = currentRoom
    shownGeneration = generation
  }

  const first = refresh(firstResponse)
  const second = refresh(secondResponse)
  resolveSecond(2)
  await second
  currentRoom = 'generation-2-room'
  disconnectedRoom = null
  resolveFirst(1)
  await first

  assert.equal(shownGeneration, 2)
  assert.equal(currentRoom, 'generation-2-room')
  assert.equal(disconnectedRoom, null)
})

test('connect errors expose only pre-sanitized API copy and hide SDK details', () => {
  const policy = mediaLifecycle as unknown as {
    VOICE_CONNECT_FAILURE_MESSAGE?: string
    getVoiceConnectErrorMessage?: (
      error: unknown,
      sanitizedApiMessages: readonly string[],
    ) => string
  }

  assert.equal(typeof policy.getVoiceConnectErrorMessage, 'function')
  assert.equal(typeof policy.VOICE_CONNECT_FAILURE_MESSAGE, 'string')
  assert.equal(
    policy.getVoiceConnectErrorMessage?.(
      new Error('통화 서버를 준비 중이에요. 아직 마이크는 연결되지 않았어요.'),
      ['통화 서버를 준비 중이에요. 아직 마이크는 연결되지 않았어요.'],
    ),
    '통화 서버를 준비 중이에요. 아직 마이크는 연결되지 않았어요.',
  )
  assert.equal(
    policy.getVoiceConnectErrorMessage?.(
      new Error('failed wss://provider.invalid?access_token=secret-fragment'),
      ['통화 서버를 준비 중이에요. 아직 마이크는 연결되지 않았어요.'],
    ),
    policy.VOICE_CONNECT_FAILURE_MESSAGE,
  )
  assert.doesNotMatch(policy.VOICE_CONNECT_FAILURE_MESSAGE ?? '', /provider|token|wss?:\/\//i)
})
