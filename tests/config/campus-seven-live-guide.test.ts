import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  getCampusSevenGuideCueSchedule,
  getCampusSevenLiveGuide,
  getCampusSevenRefreshDelay,
} from '../../lib/campus-seven/live-guide'

test('campus seven has a server-time live guide boundary', () => {
  assert.equal(existsSync(join(process.cwd(), 'lib/campus-seven/live-guide.ts')), true)
})

const schedule = {
  dayNumber: 1,
  startsAt: '2026-07-17T10:00:00.000Z',
  endsAt: '2026-07-17T13:00:00.000Z',
  meetingPointName: '부산대 정문 시계탑',
}

test('before the program it reveals only the next producer-message time', () => {
  const guide = getCampusSevenLiveGuide({
    ...schedule,
    now: '2026-07-17T09:00:00.000Z',
  })

  assert.equal(guide.phase, 'before')
  assert.equal(guide.isLive, false)
  assert.equal(guide.messages.length, 0)
  assert.equal(guide.nextUnlockAt, '2026-07-17T09:40:00.000Z')
})

test('during the program it returns only reached messages and the next unlock', () => {
  const guide = getCampusSevenLiveGuide({
    ...schedule,
    now: '2026-07-17T11:10:00.000Z',
  })

  assert.equal(guide.phase, 'live')
  assert.equal(guide.isLive, true)
  assert.deepEqual(guide.messages.map((message) => message.id), [
    'day-1-arrival',
    'day-1-opening',
    'day-1-move',
  ])
  assert.equal(guide.currentMessage?.title, '자리를 바꿀 시간이에요')
  assert.equal(guide.nextUnlockAt, '2026-07-17T11:50:00.000Z')
  assert.equal(guide.messages.some((message) => message.title.includes('마음 기록')), false)
})

test('after the program it closes the live state without exposing another day', () => {
  const guide = getCampusSevenLiveGuide({
    ...schedule,
    now: '2026-07-17T13:05:00.000Z',
  })

  assert.equal(guide.phase, 'complete')
  assert.equal(guide.isLive, false)
  assert.equal(guide.progressPercent, 100)
  assert.equal(guide.nextUnlockAt, null)
  assert.equal(guide.dayLabel, 'DAY 1')
  assert.equal(guide.messages.every((message) => message.id.startsWith('day-1-')), true)
})

test('live refresh waits for the next cue and stays within timer bounds', () => {
  assert.equal(getCampusSevenRefreshDelay({
    now: '2026-07-17T10:00:00.000Z',
    nextUnlockAt: '2026-07-17T10:01:00.000Z',
  }), 60_250)
  assert.equal(getCampusSevenRefreshDelay({
    now: '2026-07-17T10:01:00.000Z',
    nextUnlockAt: '2026-07-17T10:00:59.000Z',
  }), 250)
  assert.equal(getCampusSevenRefreshDelay({
    now: '2026-07-17T10:00:00.000Z',
    nextUnlockAt: null,
  }), null)
})

test('day six decisions and day seven final choice have exact producer cue times', () => {
  const cues = getCampusSevenGuideCueSchedule()

  assert.equal(cues.length, 38)
  assert.deepEqual(cues.filter((cue) => cue.dayNumber === 6).map((cue) => [cue.key, cue.offsetMinutes]), [
    ['date-choice-open', -420],
    ['date-choice-close', -240],
    ['date-response-close', -120],
    ['arrival', -20],
    ['opening', 0],
    ['question', 55],
    ['check', 110],
    ['closing', 155],
  ])
  assert.deepEqual(cues.filter((cue) => cue.dayNumber === 7).at(-1), {
    dayNumber: 7,
    key: 'final',
    offsetMinutes: 240,
  })
})
