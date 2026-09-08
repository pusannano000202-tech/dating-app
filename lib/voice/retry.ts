export type VoiceRetry = { fingerprint: string; key: string }

/** Preserve a mutation key when the network loses its response; edits start a new intent. */
export function voiceRetryKey(
  previous: VoiceRetry | null,
  payload: unknown,
  create: () => string = () => crypto.randomUUID(),
): VoiceRetry {
  const fingerprint = JSON.stringify(payload)
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, key: create() }
}
