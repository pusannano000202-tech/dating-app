export type VoiceRoomSlot<T> = { current: T | null }
export type VoiceSessionEpochSlot = { current: number }

export const VOICE_CONNECT_FAILURE_MESSAGE =
  '음성 연결에 실패했어요. 잠시 후 다시 연결해 주세요. 마이크는 켜지지 않았어요.'

export function isCurrentVoiceRoom<T>(
  slot: VoiceRoomSlot<T>,
  room: T,
  alive: boolean,
): boolean {
  return alive && slot.current === room
}

export function isCurrentVoiceSessionEpoch(
  slot: VoiceSessionEpochSlot,
  expectedEpoch: number,
  alive: boolean,
): boolean {
  return alive && slot.current === expectedEpoch
}

export function isCurrentVoiceRefresh(
  epochSlot: VoiceSessionEpochSlot,
  expectedEpoch: number,
  sequenceSlot: VoiceSessionEpochSlot,
  expectedSequence: number,
  alive: boolean,
): boolean {
  return (
    sequenceSlot.current === expectedSequence &&
    isCurrentVoiceSessionEpoch(epochSlot, expectedEpoch, alive)
  )
}

export function canFinalizeVoiceDisconnect<T>(
  roomSlot: VoiceRoomSlot<T>,
  epochSlot: VoiceSessionEpochSlot,
  expectedEpoch: number,
  alive: boolean,
): boolean {
  return (
    roomSlot.current === null &&
    isCurrentVoiceSessionEpoch(epochSlot, expectedEpoch, alive)
  )
}

export function getVoiceConnectErrorMessage(
  error: unknown,
  sanitizedApiMessages: readonly string[],
): string {
  if (error instanceof Error && sanitizedApiMessages.includes(error.message)) {
    return error.message
  }
  return VOICE_CONNECT_FAILURE_MESSAGE
}

export function releaseCurrentVoiceRoom<T>(
  slot: VoiceRoomSlot<T>,
  room: T,
): boolean {
  if (slot.current !== room) return false
  slot.current = null
  return true
}
