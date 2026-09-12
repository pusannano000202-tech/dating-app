import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGroupMentoringCommand } from '../../lib/mentoring/group-contract.ts'
const id = () => crypto.randomUUID()
test('group entry accepts only 2+2 or 3+3 with explicit same-role friend invitations', () => {
  for (const side_size of [2, 3]) assert.ok(parseGroupMentoringCommand({action:'join',args:{role:'mentor',side_size,friend_ids:[],client_id:id()}}))
  for (const side_size of [1,4,5]) assert.equal(parseGroupMentoringCommand({action:'join',args:{role:'mentor',side_size,friend_ids:[],client_id:id()}}),null)
  assert.equal(parseGroupMentoringCommand({action:'join',args:{role:'mentor',topic:'courses'}}),null)
  assert.equal(parseGroupMentoringCommand({action:'join',args:{role:'mentee',side_size:2,friend_ids:[id(),id()],client_id:id()}}),null)
})
test('group commands reject identity injection, missing consent and duplicate friends', () => {
  const friend=id(),party=id()
  assert.equal(parseGroupMentoringCommand({action:'join',args:{role:'mentor',side_size:3,friend_ids:[friend,friend],client_id:id()}}),null)
  assert.equal(parseGroupMentoringCommand({action:'party_accept',args:{party_id:party,user_id:friend}}),null)
  assert.ok(parseGroupMentoringCommand({action:'party_accept',args:{party_id:party}}))
  assert.equal(parseGroupMentoringCommand({action:'report',args:{session_id:id(),reason:'불편했어요'}}),null)
  assert.ok(parseGroupMentoringCommand({action:'report',args:{session_id:id(),member_id:id(),reason:'불편했어요'}}))
})
