import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  getQuantumEventById,
  getQuantumEventStartHref,
  isQuantumPartyType,
  quantumEventCatalog,
  type QuantumEventMode,
} from '../../lib/matching/quantum-event-catalog'

const modes: QuantumEventMode[] = ['tonight', 'scheduled']

const activityPhotoNames = [
  'event-jogging-v2.webp',
  'event-board-game.webp',
  'event-drinks.webp',
  'event-dinner.webp',
  'event-walk-v2.webp',
] as const

test('every Quantum event is a five-person balanced configuration', () => {
  for (const mode of modes) {
    for (const event of quantumEventCatalog[mode]) {
      assert.equal(event.totalPeople, 5)
      assert.ok(
        (event.maleCount === 3 && event.femaleCount === 2)
          || (event.maleCount === 2 && event.femaleCount === 3),
      )
    }
  }
})

test('catalog keeps the approved tonight and scheduled activity samples', () => {
  assert.deepEqual(
    quantumEventCatalog.tonight.map((event) => event.title),
    ['온천장 저녁 조깅', '보드게임 한 판', '오늘 밤 한잔', '금강공원 밤 산책'],
  )
  assert.ok(quantumEventCatalog.scheduled.every((event) => /다음 주/.test(event.schedule)))
  assert.deepEqual(
    quantumEventCatalog.scheduled.map((event) => event.title),
    ['보드게임 데이', '온천천 천천히 달리기', '금강공원 같이 걷기', '주말 산책'],
  )
  assert.equal(
    quantumEventCatalog.scheduled.find((event) => event.id === 'scheduled-walk')?.location,
    '온천장 금강공원 산책로',
  )
})

test('every guided event explains its duration and three concrete missions', () => {
  for (const mode of modes) {
    for (const event of quantumEventCatalog[mode]) {
      assert.match(event.duration, /90|120|150/)
      assert.equal(event.missions.length, 3)
      assert.ok(event.missions.every((mission) => mission.length >= 8))
    }
  }
})

test('event cylinder uses real activity scenes and every photo asset exists', () => {
  const discovery = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/QuantumMatchDiscovery.tsx'),
    'utf8',
  )

  const wheelPath = path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx')
  assert.ok(fs.existsSync(wheelPath), 'QuantumEventWheel.tsx must exist')
  const wheel = fs.readFileSync(wheelPath, 'utf8')
  const catalogSource = fs.readFileSync(
    path.join(process.cwd(), 'lib/matching/quantum-event-catalog.ts'),
    'utf8',
  )

  for (const photoName of activityPhotoNames) {
    assert.ok(
      fs.existsSync(path.join(process.cwd(), 'public/images/match/events', photoName)),
      `missing activity photo: ${photoName}`,
    )
    assert.match(catalogSource, new RegExp(photoName.replace('.', '\\.')))
  }

  assert.match(wheel, /alt=\{photo\.alt\}/)
  assert.match(wheel, /data-layout="cylindrical-carousel"/)
  assert.match(wheel, /perspective: '1200px'/)
  assert.match(wheel, /rotateY\(/)
  assert.match(wheel, /transformStyle: 'preserve-3d'/)
  assert.match(wheel, /rounded-lg/)
  assert.doesNotMatch(wheel, /aspect-square w-\[clamp\(240px,72vw,440px\)\]/)
  assert.doesNotMatch(discovery, /grid gap-3 sm:grid-cols-2/)
})

test('scene switch makes today and date planning unmistakable without nested badges', () => {
  const discovery = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/QuantumMatchDiscovery.tsx'),
    'utf8',
  )
  const wheel = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx'),
    'utf8',
  )

  assert.match(discovery, /label: '오늘 바로'/)
  assert.match(discovery, /label: '날짜 골라 만나기'/)
  assert.match(discovery, /오늘 바로 가볍게 만나기/)
  assert.match(discovery, /원하는 날짜의 특별한 만남/)
  assert.match(discovery, /mode-scene-switch/)
  assert.match(discovery, /quantum-tonight-five\.webp/)
  assert.match(discovery, /quantum-scheduled-five\.png/)
  assert.match(discovery, /role="tab"/)
  assert.match(discovery, /aria-selected=\{active\}/)
  assert.match(discovery, /MoonStar/)
  assert.match(discovery, /CalendarDays/)
  assert.match(discovery, /오늘 18:30/)
  assert.match(discovery, /금 · 토 · 일/)
  assert.match(discovery, /data-layout="time-context-switch"/)
  assert.doesNotMatch(discovery, /badge:/)
  assert.doesNotMatch(discovery, /aria-label="선택됨"/)
  assert.doesNotMatch(wheel, /TONIGHT WHEEL|NEXT WEEK WHEEL/)
})

test('meetup cylinder math wraps and shows only the nearest side cards', () => {
  const helperPath = path.join(process.cwd(), 'lib/community/meetup-cylinder.ts')
  assert.ok(fs.existsSync(helperPath), 'meetup-cylinder.ts must exist')
  const helper = require('../../lib/community/meetup-cylinder') as {
    getNextMeetupIdeaIndex: (active: number, direction: -1 | 1, count: number) => number
    getMeetupCylinderOffset: (index: number, active: number, count: number) => number | null
  }

  assert.equal(helper.getNextMeetupIdeaIndex(0, -1, 4), 3)
  assert.equal(helper.getNextMeetupIdeaIndex(3, 1, 4), 0)
  assert.equal(helper.getMeetupCylinderOffset(3, 0, 4), -1)
  assert.equal(helper.getMeetupCylinderOffset(1, 0, 4), 1)
  assert.equal(helper.getMeetupCylinderOffset(2, 0, 5), null)
})

test('wheel math wraps around and keeps the nearest signed offset', () => {
  const helperPath = path.join(process.cwd(), 'lib/matching/quantum-event-wheel.ts')
  assert.ok(fs.existsSync(helperPath), 'quantum-event-wheel.ts must exist')

  const wheel = require('../../lib/matching/quantum-event-wheel') as {
    getNextEventIndex: (active: number, direction: -1 | 1, count: number) => number
    getEventWheelOffset: (index: number, active: number, count: number) => number | null
  }

  assert.equal(wheel.getNextEventIndex(0, -1, 4), 3)
  assert.equal(wheel.getNextEventIndex(3, 1, 4), 0)
  assert.equal(wheel.getEventWheelOffset(3, 0, 4), -1)
  assert.equal(wheel.getEventWheelOffset(1, 0, 4), 1)
})

test('event wheel supports swipe, arrow keys, and explicit previous and next controls', () => {
  const wheelPath = path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx')
  assert.ok(fs.existsSync(wheelPath), 'QuantumEventWheel.tsx must exist')
  const wheel = fs.readFileSync(wheelPath, 'utf8')

  assert.match(wheel, /onPointerDown/)
  assert.match(wheel, /onPointerUp/)
  assert.match(wheel, /ArrowLeft/)
  assert.match(wheel, /ArrowRight/)
  assert.match(wheel, /aria-label="이전 활동"/)
  assert.match(wheel, /aria-label="다음 활동"/)
  assert.match(wheel, /motion-reduce:transition-none/)
  assert.doesNotMatch(wheel, /두루마리처럼/)
  assert.doesNotMatch(wheel, /늦은 저녁/)
})

test('event wheel exposes honest single-participation states', () => {
  const wheelPath = path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx')
  assert.ok(fs.existsSync(wheelPath), 'QuantumEventWheel.tsx must exist')
  const wheel = fs.readFileSync(wheelPath, 'utf8')

  assert.match(wheel, /참여 중/)
  assert.match(wheel, /이 활동으로 변경/)
  assert.match(wheel, /현재 참여 중인 약속을 변경할까요/)
  assert.match(wheel, /event-participation/)
  assert.match(wheel, /schema_unavailable/)
})

test('event start links encode the selected event and party without API state', () => {
  const event = quantumEventCatalog.tonight[0]

  assert.equal(getQuantumEventStartHref(event.id, 'solo'), '/match/start?event=tonight-onsenjjang-run&party=solo')
  assert.equal(getQuantumEventStartHref(event.id, 'friends'), '/match/start?event=tonight-onsenjjang-run&party=friends')
})

test('event selections are resolved only from the approved catalog', () => {
  assert.equal(getQuantumEventById('tonight-board-game')?.title, '보드게임 한 판')
  assert.equal(getQuantumEventById('unknown-event'), null)
  assert.equal(isQuantumPartyType('solo'), true)
  assert.equal(isQuantumPartyType('friends'), true)
  assert.equal(isQuantumPartyType('mixed'), false)
})

test('event application review keeps the five-person contract without entering the legacy queue', () => {
  const eventPage = fs.readFileSync(
    path.join(process.cwd(), 'app/match/events/[eventId]/page.tsx'),
    'utf8',
  )

  assert.match(eventPage, /총 5명/)
  assert.match(eventPage, /3남 2녀 또는 3녀 2남/)
  assert.match(eventPage, /같은 성별 친구/)
  const applicationStatus = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/QuantumEventApplicationStatus.tsx'),
    'utf8',
  )
  assert.match(eventPage, /QuantumEventApplicationStatus/)
  assert.match(applicationStatus, /신청이 접수됐어요/)
  assert.match(applicationStatus, /event-participation/)
  assert.match(applicationStatus, /수락한 친구와 한 팀으로 접수/)
  assert.doesNotMatch(eventPage, /enter_match_pool/)
  assert.doesNotMatch(eventPage, /\/api\/match-pool\/enter/)
})

test('appearance preparation keeps the selected event visible', () => {
  const matchStart = fs.readFileSync(path.join(process.cwd(), 'app/match/start/page.tsx'), 'utf8')
  const scoreGate = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/AppearanceScoreGate.tsx'),
    'utf8',
  )

  assert.match(matchStart, /eventTitle=\{eventContext\?\.event\.title\}/)
  assert.match(matchStart, /eventMeta=\{eventContext/)
  assert.match(scoreGate, /선택한 약속/)
  assert.match(matchStart, /eventContext \? \[\] : buildSetupSteps/)
  assert.match(matchStart, /선택한 활동과 외모 분석 준비만 확인했어요/)
  assert.match(matchStart, /if \(eventContext && appearanceScoreReady\) \{[\s\S]*redirect\(/)
  assert.match(matchStart, /\/match\/events\/\$\{encodeURIComponent\(eventContext\.event\.id\)\}/)
})

test('event application treats a cancelled lifecycle as a fresh application', () => {
  const applicationStatus = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/QuantumEventApplicationStatus.tsx'),
    'utf8',
  )

  assert.match(applicationStatus, /isActiveQuantumEventLifecycle/)
  assert.match(applicationStatus, /const activeLifecycle = lifecycle && isActiveQuantumEventLifecycle\(lifecycle\)/)
  assert.match(applicationStatus, /lifecycleStage !== 'cancelled'/)
  assert.match(applicationStatus, /setReplacingAnotherEvent\(Boolean\(activeParticipation\)\)/)
})

test('legacy 2:2, 3:3, team, and candidate cards stay hidden after the event-first switch', () => {
  const matchPage = fs.readFileSync(path.join(process.cwd(), 'app/match/page.tsx'), 'utf8')

  assert.match(matchPage, /const LEGACY_MATCH_ENTRY_VISIBLE = false/)
  assert.match(matchPage, /const shouldShowLegacyStatus = LEGACY_MATCH_ENTRY_VISIBLE &&/)
  assert.match(matchPage, /const shouldShowLegacyResult = LEGACY_MATCH_ENTRY_VISIBLE &&/)
  assert.match(matchPage, /if \(LEGACY_MATCH_ENTRY_VISIBLE && loadFailure && !loading\)/)
  assert.match(matchPage, /LEGACY_MATCH_ENTRY_VISIBLE && !loading && !hasAnyStartedMatching/)
  assert.match(matchPage, /LEGACY_MATCH_ENTRY_VISIBLE && shouldShowMatchingPool/)
  assert.match(matchPage, /shouldShowLegacyResult \? \(/)
})
