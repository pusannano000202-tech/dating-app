import type { ChatPoll } from './contract'

/** Refresh counts without overwriting a member's unsubmitted ballot. */
export function mergePollSelections(
  polls: readonly Pick<ChatPoll, 'id' | 'status' | 'options'>[],
  drafts: Record<string, string[]>,
  dirty: ReadonlySet<string>,
): Record<string, string[]> {
  return Object.fromEntries(polls.map(poll => {
    const allowed = new Set(poll.options.map(option => option.id))
    const selected = poll.status === 'open' && dirty.has(poll.id) && drafts[poll.id]
      ? drafts[poll.id].filter(id => allowed.has(id))
      : poll.options.filter(option => option.selectedByMe).map(option => option.id)
    return [poll.id, selected]
  }))
}
