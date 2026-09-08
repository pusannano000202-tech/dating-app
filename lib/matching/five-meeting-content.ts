import { day1BoardGame } from './day1-board-game'
import { day2Conversation } from './day2-conversation'
import { day3Bowling } from './day3-bowling'
import { day4SameAnswer } from './day4-same-answer'
import { day5NightSea } from './day5-night-sea'

const DAYS = [day1BoardGame, day2Conversation, day3Bowling, day4SameAnswer, day5NightSea] as const

export type ContinuationDayDefinition = (typeof DAYS)[number]

export function getContinuationDayDefinition(day: number): ContinuationDayDefinition | null {
  return DAYS.find((item) => item.day === day) ?? null
}

export function getContinuationDayDefinitions(): readonly ContinuationDayDefinition[] {
  return DAYS
}
