import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePollSelections } from '../../lib/chat-polls/selection-drafts'
import type { ChatPoll } from '../../lib/chat-polls/contract'

const poll: Pick<ChatPoll, 'id' | 'status' | 'options'> = {
  id: 'poll', status: 'open', options: [
    { id: 'a', label: '산책', position: 0, voteCount: 0, selectedByMe: false },
    { id: 'b', label: '게임', position: 1, voteCount: 1, selectedByMe: true },
  ],
}
test('quiet refresh preserves unsubmitted multi-selection and explicit empty draft', () => {
  assert.deepEqual(mergePollSelections([poll], { poll: ['a', 'b'] }, new Set(['poll'])), { poll: ['a', 'b'] })
  assert.deepEqual(mergePollSelections([poll], { poll: [] }, new Set(['poll'])), { poll: [] })
})
test('saved or ended polls use authoritative ballots; absent polls are dropped', () => {
  assert.deepEqual(mergePollSelections([poll], { poll: ['a'], old: ['a'] }, new Set()), { poll: ['b'] })
  assert.deepEqual(mergePollSelections([{ ...poll, status: 'closed' }], { poll: ['a'] }, new Set(['poll'])), { poll: ['b'] })
})
test('a draft cannot restore removed options or old-account draft after scope reset', () => {
  assert.deepEqual(mergePollSelections([poll], { poll: ['gone', 'a'] }, new Set(['poll'])), { poll: ['a'] })
  assert.deepEqual(mergePollSelections([poll], {}, new Set()), { poll: ['b'] })
})
