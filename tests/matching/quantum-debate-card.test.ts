import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMatchingSignals,
  normalizeDebateChoice,
  pickSharedDebateAnswers,
  type QuantumDebateAnswer,
  type QuantumProfilePreference,
} from '../../lib/matching/quantum-profile-preferences'

const ANSWERS: QuantumDebateAnswer[] = [
  { questionId: 'tangsuyuk', choice: 'A', shareOnCard: true },
  { questionId: 'mint-chocolate', choice: 'B', shareOnCard: false },
  { questionId: 'jjajang-jjamppong', choice: 'SKIP', shareOnCard: true },
  { questionId: 'naengmyeon', choice: 'B', shareOnCard: true },
  { questionId: 'hotdog-bite', choice: 'A', shareOnCard: true },
]

const VALID_PREFERENCE: QuantumProfilePreference = {
  schemaVersion: 2,
  mbti: 'INFP',
  relationshipBoundary: null,
  conversationEnergy: 'speaker',
  planStyle: 'planner',
  interests: ['board-games', 'running', 'movies'],
  favoriteMusic: 'Indie pop',
  debateAnswers: ANSWERS,
  questionBankVersion: 'quantum-debate-v1',
  updatedAt: null,
}

test('normalizes only the explicit A, B, and SKIP debate choices', () => {
  assert.equal(normalizeDebateChoice('A'), 'A')
  assert.equal(normalizeDebateChoice('B'), 'B')
  assert.equal(normalizeDebateChoice('SKIP'), 'SKIP')
  assert.equal(normalizeDebateChoice('a'), null)
  assert.equal(normalizeDebateChoice('C'), null)
})

test('exposes at most three opted-in debate answers without mutating the source', () => {
  const shared = pickSharedDebateAnswers(ANSWERS)

  assert.equal(shared.length, 3)
  assert.equal(shared.every((answer) => answer.shareOnCard), true)
  assert.deepEqual(shared.map((answer) => answer.questionId), ['tangsuyuk', 'jjajang-jjamppong', 'naengmyeon'])
  assert.notEqual(shared[0], ANSWERS[0])
})

test('keeps debate choices out of buildMatchingSignals', () => {
  const signals = buildMatchingSignals(VALID_PREFERENCE)

  assert.deepEqual(signals, { conversationEnergy: 'speaker', planStyle: 'planner' })
  assert.equal(JSON.stringify(signals).includes('debate'), false)
})
