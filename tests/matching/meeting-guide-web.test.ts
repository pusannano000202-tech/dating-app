import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { MEETING_GUIDE_SCENES } from '../../lib/matching/meeting-guide'

const root = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('web meeting guide presents six scenes one at a time with trust-first ordering', () => {
  const contractPath = join(root, 'lib/matching/meeting-guide.ts')
  const componentPath = join(root, 'components/matching/MeetingGuideStory.tsx')

  assert.equal(existsSync(contractPath), true)
  assert.equal(existsSync(componentPath), true)

  const contract = readSource('lib/matching/meeting-guide.ts')
  const component = readSource('components/matching/MeetingGuideStory.tsx')

  assert.match(contract, /MEETING_GUIDE_SCENES/)
  assert.equal((contract.match(/stepNumber: [1-6]/g) ?? []).length, 6)
  assert.ok(contract.indexOf('외부 연락처') < contract.indexOf('행사 전용 가명'))
  assert.match(component, /activeIndex/)
  assert.match(component, /이전/)
  assert.match(component, /다음/)
  assert.match(component, /안내 확인 완료/)
  assert.match(component, /prefers-reduced-motion/)
  assert.match(component, /data-layout="character-speech-overlay"/)
  assert.match(component, /meeting-rules-comic-v2\.webp/)
  assert.match(component, /data-bubble="comic"/)
  assert.doesNotMatch(component, /MessageCircleMore/)
})

test('every comic speech bubble uses short explicit lines that fit the artwork', () => {
  for (const scene of MEETING_GUIDE_SCENES) {
    for (const dialogue of scene.dialogue) {
      const fittedDialogue = dialogue as typeof dialogue & { lines?: readonly string[] }

      assert.ok(fittedDialogue.lines, `scene ${scene.stepNumber} is missing fitted lines`)
      assert.ok(fittedDialogue.lines.length >= 1 && fittedDialogue.lines.length <= 2)
      assert.equal(fittedDialogue.lines.join(' '), dialogue.text)

      for (const line of fittedDialogue.lines) {
        assert.ok(line.length <= 15, `scene ${scene.stepNumber} line is too long: ${line}`)
      }
    }
  }

  const component = readSource('components/matching/MeetingGuideStory.tsx')
  assert.match(component, /bubble\.lines\.map/)
  assert.match(component, /whitespace-nowrap/)
  assert.doesNotMatch(component, /translate-y-/)
  assert.match(component, /w-full[^\n]*items-center justify-center/)
})

test('every guide scene keeps the original comic ratio and centers dialogue inside measured white bubbles', () => {
  const component = readSource('components/matching/MeetingGuideStory.tsx')

  assert.match(component, /aspect-\[3\/4\]/)
  assert.doesNotMatch(component, /aspect-\[7\/8\]/)
  assert.ok(component.includes("1: ['left-[17%] top-[8%] h-[18%] w-[45%]', 'left-[28%] top-[74%] h-[21%] w-[52%]']"))
  assert.ok(component.includes("2: ['left-[37%] top-[8%] h-[18%] w-[53%]', 'left-[10%] top-[74%] h-[23%] w-[58%]']"))
  assert.ok(component.includes("3: ['left-[17%] top-[2%] h-[19%] w-[57%]', 'left-[55%] top-[68%] h-[18%] w-[32%] px-1']"))
  assert.ok(component.includes("4: ['left-[21%] top-[2%] h-[19%] w-[51%]', 'left-[8%] top-[70%] h-[20%] w-[62%]']"))
  assert.ok(component.includes("5: ['left-[18%] top-[2%] h-[19%] w-[58%] gap-0']"))
  assert.ok(component.includes("6: ['left-[19%] top-[2%] h-[19%] w-[53%]', 'left-[13%] top-[80%] h-[18%] w-[52%]']"))
  assert.match(component, /getComicSpeakerSizeClassName\(scene\.stepNumber\)/)
  assert.match(component, /getComicBodySizeClassName\(scene\.stepNumber\)/)
  assert.match(component, /return 'text-\[15px\] sm:text-\[16px\]'/)
})

test('comic dialogue uses readable mobile type and fills each bubble for true center alignment', () => {
  const component = readSource('components/matching/MeetingGuideStory.tsx')

  assert.match(component, /h-full w-full/)
  assert.match(component, /items-center justify-center/)
  assert.match(component, /text-\[15px\]/)
  assert.match(component, /leading-\[1\.2\]/)
})

test('saved event application returns home and supports cancellation before confirmation', () => {
  const status = readSource('components/matching/QuantumEventApplicationStatus.tsx')

  assert.match(status, /홈으로 돌아가기/)
  assert.match(status, /href="\/"/)
  assert.match(status, /cancelApplication/)
  assert.match(status, /method: 'DELETE'/)
  assert.match(status, /신청 취소/)
})

test('event join opens the six-scene guide before any participation mutation', () => {
  const wheel = readSource('components/matching/QuantumEventWheel.tsx')
  const status = readSource('components/matching/QuantumEventApplicationStatus.tsx')

  assert.match(wheel, /MeetingGuideStory/)
  assert.match(wheel, /setGuideOpen\(true\)/)
  assert.match(wheel, /quantum-meeting-guide:\$\{activeEvent\.id\}/)
  assert.match(wheel, /=== 'confirmed'/)
  assert.match(wheel, /router\.push\(getQuantumEventStartHref\(activeEvent\.id, party\)\)/)
  assert.match(status, /MeetingGuideStory/)
  assert.match(status, /참여 전 안내를 모두 확인해야 신청할 수 있어요/)
  assert.doesNotMatch(status, /참여 전 안내 6장 보기/)
})

test('mandatory event guide hides global bottom navigation to keep the story unobstructed', () => {
  const bottomNav = readSource('components/navigation/AppBottomNav.tsx')

  assert.match(bottomNav, /pathname\.startsWith\('\/match\/events\/'\)/)
})

test('global bottom navigation exposes chat without opening My first', () => {
  const bottomNav = readSource('components/navigation/AppBottomNav.tsx')

  assert.match(bottomNav, /href: '\/chat'/)
  assert.match(bottomNav, /label: '채팅'/)
})

test('friend participation requires a real accepted group before saving', () => {
  const status = readSource('components/matching/QuantumEventApplicationStatus.tsx')
  const setup = readSource('components/matching/QuantumFriendPartySetup.tsx')
  const api = readSource('app/api/match/event-participation/route.ts')

  assert.match(status, /QuantumFriendPartySetup/)
  assert.match(status, /group_id: friendGroupId/)
  assert.match(setup, /\/api\/groups/)
  assert.match(setup, /\/api\/group-invites/)
  assert.match(setup, /친구 수락을 기다리는 중/)
  assert.match(api, /p_group_id/)
  assert.match(api, /friend_group_required/)
  assert.match(api, /friend_group_gender_mismatch/)
})
