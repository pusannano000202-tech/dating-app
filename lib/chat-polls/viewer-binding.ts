import { isChatPollId } from './contract'

/** Both inputs are fixed-width UUIDs; compare every character before deciding. */
export function safeViewerBindingEqual(expected: unknown, actual: unknown): boolean {
  if (!isChatPollId(expected) || !isChatPollId(actual)) return false
  const left = expected.toLocaleLowerCase('en-US')
  const right = actual.toLocaleLowerCase('en-US')
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}
