import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCampusSevenActionAvailability,
  getCampusSevenNextRefreshAt,
} from '../../lib/campus-seven/action-availability'

function schedule(dayNumber: number, endsAt = '2026-07-21T13:00:00.000Z') {
  return {
    dayNumber,
    startsAt: '2026-07-21T10:00:00.000Z',
    endsAt,
  }
}

test('day two choices open only for the first thirty minutes', () => {
  const before = getCampusSevenActionAvailability({ schedule: schedule(2), now: '2026-07-21T09:59:59.000Z' })
  const open = getCampusSevenActionAvailability({ schedule: schedule(2), now: '2026-07-21T10:00:00.000Z' })
  const closed = getCampusSevenActionAvailability({ schedule: schedule(2), now: '2026-07-21T10:30:00.000Z' })

  assert.equal(before.dayTwoChoices.state, 'before_window')
  assert.equal(before.nextChangeAt, '2026-07-21T10:00:00.000Z')
  assert.equal(open.dayTwoChoices.isOpen, true)
  assert.equal(open.dayTwoChoices.closesAt, '2026-07-21T10:30:00.000Z')
  assert.equal(closed.dayTwoChoices.state, 'closed')
})

test('interest and game result actions open near the end with a thirty minute grace period', () => {
  const interestBefore = getCampusSevenActionAvailability({ schedule: schedule(3), now: '2026-07-21T12:34:59.000Z' })
  const interestOpen = getCampusSevenActionAvailability({ schedule: schedule(3), now: '2026-07-21T12:35:00.000Z' })
  const interestClosed = getCampusSevenActionAvailability({ schedule: schedule(3), now: '2026-07-21T13:30:00.000Z' })
  const gameOpen = getCampusSevenActionAvailability({ schedule: schedule(4), now: '2026-07-21T12:35:00.000Z' })

  assert.equal(interestBefore.interestVote.state, 'before_window')
  assert.equal(interestOpen.interestVote.isOpen, true)
  assert.equal(interestOpen.interestVote.closesAt, '2026-07-21T13:30:00.000Z')
  assert.equal(interestClosed.interestVote.state, 'closed')
  assert.equal(gameOpen.gameRank.isOpen, true)
})

test('day six invitation and response windows use the pre-event schedule', () => {
  const noon = getCampusSevenActionAvailability({ schedule: schedule(6), now: '2026-07-21T03:00:00.000Z' })
  const choiceClosed = getCampusSevenActionAvailability({ schedule: schedule(6), now: '2026-07-21T06:00:00.000Z' })
  const responseOpen = getCampusSevenActionAvailability({ schedule: schedule(6), now: '2026-07-21T07:59:59.000Z' })
  const responseClosed = getCampusSevenActionAvailability({ schedule: schedule(6), now: '2026-07-21T08:00:00.000Z' })

  assert.equal(noon.dateChoice.isOpen, true)
  assert.equal(noon.dateResponse.isOpen, true)
  assert.equal(choiceClosed.dateChoice.state, 'closed')
  assert.equal(choiceClosed.dateResponse.isOpen, true)
  assert.equal(responseOpen.dateResponse.isOpen, true)
  assert.equal(responseClosed.dateResponse.state, 'closed')
})

test('day seven final decision opens after the gathering and remains open for two hours', () => {
  const beforeEnd = getCampusSevenActionAvailability({ schedule: schedule(7, '2026-07-21T14:00:00.000Z'), now: '2026-07-21T13:59:59.000Z' })
  const afterEnd = getCampusSevenActionAvailability({ schedule: schedule(7, '2026-07-21T14:00:00.000Z'), now: '2026-07-21T14:00:00.000Z' })
  const closed = getCampusSevenActionAvailability({ schedule: schedule(7, '2026-07-21T14:00:00.000Z'), now: '2026-07-21T16:00:00.000Z' })

  assert.equal(beforeEnd.finalProposal.state, 'before_window')
  assert.equal(afterEnd.finalProposal.isOpen, true)
  assert.equal(afterEnd.finalResponse.isOpen, true)
  assert.equal(afterEnd.finalProposal.closesAt, '2026-07-21T16:00:00.000Z')
  assert.equal(closed.finalResponse.state, 'closed')
})

test('unscheduled actions stay closed and refresh uses the earliest server boundary', () => {
  const unavailable = getCampusSevenActionAvailability({ schedule: null, now: '2026-07-21T10:00:00.000Z' })
  assert.equal(unavailable.interestVote.state, 'not_scheduled')
  assert.equal(unavailable.nextChangeAt, null)

  assert.equal(getCampusSevenNextRefreshAt({
    guideNextUnlockAt: '2026-07-21T10:20:00.000Z',
    actionNextChangeAt: '2026-07-21T10:10:00.000Z',
  }), '2026-07-21T10:10:00.000Z')
})
