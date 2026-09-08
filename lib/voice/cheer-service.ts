import { getCheerTeam, type CheerTeam } from './cheer-catalog'
import { requireUuid } from './policy'

export type CheerJoinInput = {
  team: CheerTeam
  idempotencyKey: string
}

export function parseCheerJoinInput(input: unknown): CheerJoinInput {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('invalid_input')
  const value = input as Record<string, unknown>
  if (
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'teamId') ||
    !Object.hasOwn(value, 'idempotencyKey') ||
    typeof value.teamId !== 'string'
  )
    throw new Error('invalid_input')
  const team = getCheerTeam(value.teamId)
  if (!team) throw new Error('invalid_input')
  return { team, idempotencyKey: requireUuid(value.idempotencyKey) }
}
