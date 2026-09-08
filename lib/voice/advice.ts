import { requireUuid } from './policy'
import type { AdviceRole, AdviceTopic } from './contracts'

export type { AdviceRole, AdviceTopic } from './contracts'

export type AdviceQueueInput =
  | {
      action: 'join'
      role: AdviceRole
      adviceTopic: AdviceTopic
      searchId: string
      idempotencyKey: string
    }
  | { action: 'leave'; searchId: string; idempotencyKey: string }
  | { action: 'resume'; idempotencyKey: string }

export type AdviceNextInput = {
  sessionId: string
  idempotencyKey: string
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_input')
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('invalid_input')
}

export function parseAdviceQueueInput(input: unknown): AdviceQueueInput {
  const value = object(input)
  if (value.action === 'join') {
    exactKeys(value, [
      'action',
      'role',
      'adviceTopic',
      'searchId',
      'idempotencyKey',
    ])
    if (value.role !== 'talker' && value.role !== 'listener')
      throw new Error('invalid_input')
    if (
      value.adviceTopic !== 'general' &&
      value.adviceTopic !== 'romance' &&
      value.adviceTopic !== 'career'
    )
      throw new Error('invalid_input')
    return {
      action: 'join',
      role: value.role,
      adviceTopic: value.adviceTopic,
      searchId: requireUuid(value.searchId),
      idempotencyKey: requireUuid(value.idempotencyKey),
    }
  }
  if (value.action === 'leave') {
    exactKeys(value, ['action', 'searchId', 'idempotencyKey'])
    return {
      action: 'leave',
      searchId: requireUuid(value.searchId),
      idempotencyKey: requireUuid(value.idempotencyKey),
    }
  }
  if (value.action === 'resume') {
    exactKeys(value, ['action', 'idempotencyKey'])
    return {
      action: 'resume',
      idempotencyKey: requireUuid(value.idempotencyKey),
    }
  }
  throw new Error('invalid_input')
}

export function parseAdviceTopic(value: unknown): AdviceTopic {
  if (value === 'general' || value === 'romance' || value === 'career')
    return value
  throw new Error('invalid_input')
}

export function parseAdviceNextInput(input: unknown): AdviceNextInput {
  const value = object(input)
  exactKeys(value, ['sessionId', 'idempotencyKey'])
  return {
    sessionId: requireUuid(value.sessionId),
    idempotencyKey: requireUuid(value.idempotencyKey),
  }
}

export function areComplementaryAdviceRoles(a: AdviceRole, b: AdviceRole) {
  return a !== b
}
