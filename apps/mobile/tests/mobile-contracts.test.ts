import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { primaryTabs } from '../src/domain/tabs';
import { participationReducer } from '../src/state/participation-reducer';
import { layout } from '../src/theme/tokens';

test('Quantum mobile keeps exactly five primary destinations', () => {
  assert.deepEqual(
    primaryTabs.map((tab) => tab.label),
    ['홈', '매칭', '모임', '커뮤니티', '마이'],
  );
  assert.equal(new Set(primaryTabs.map((tab) => tab.href)).size, 5);
});

test('matching screen loads events and participation from the server API', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');
  const participation = fs.readFileSync(path.join(process.cwd(), 'src/state/participation.tsx'), 'utf8');

  assert.match(screen, /getQuantumApiClient/);
  assert.match(screen, /listEvents/);
  assert.doesNotMatch(screen, /tonightEvents|scheduledEvents/);
  assert.match(participation, /getParticipation/);
  assert.match(participation, /joinEvent/);
  assert.match(participation, /cancelParticipation/);
});

test('profile screen exposes the authenticated account and a real sign-out action', () => {
  const profile = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/profile.tsx'), 'utf8');

  assert.match(profile, /useAuth/);
  assert.match(profile, /if \(!session\) return null/);
  assert.match(profile, /signOut/);
  assert.match(profile, /await signOut\(\)/);
  assert.match(profile, /Alert\.alert\(/);
  assert.doesNotMatch(profile, /session\.user/);
  assert.doesNotMatch(profile, /계정 연결 준비 중/);
});

test('mobile touch targets meet the 44 point minimum', () => {
  assert.ok(layout.minimumTouchTarget >= 44);
  assert.ok(layout.tabBarHeight >= layout.minimumTouchTarget);
});

test('joining another event replaces the previous participation', () => {
  const first = participationReducer(null, { type: 'join', eventId: 'event-a' });
  const second = participationReducer(first, { type: 'join', eventId: 'event-b' });

  assert.equal(second?.eventId, 'event-b');
  assert.equal(participationReducer(second, { type: 'cancel' }), null);
});

test('matching requires the safety guide before the participation API', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');

  assert.match(screen, /hasAcknowledgedMeetingGuide/);
  assert.match(screen, /useFocusEffect/);
  assert.match(screen, /router\.push\('\/meeting-guide'\)/);
  assert.match(screen, /안전 안내 보기/);
  assert.ok(
    screen.indexOf('await hasAcknowledgedMeetingGuide()') < screen.indexOf('await join(activeEvent.id, partyType)'),
    'the guide acknowledgement must be checked before the participation API is called',
  );
});

test('matching prepares the private appearance score after onboarding and before participation', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');

  assert.match(screen, /getProfileOnboarding/);
  assert.match(screen, /prepareAppearanceScoreForMatch/);
  assert.ok(
    screen.indexOf('await hasAcknowledgedMeetingGuide()') < screen.indexOf('getProfileOnboarding'),
    'the safety guide must be acknowledged before paid matching preparation starts',
  );
  assert.ok(
    screen.indexOf('prepareAppearanceScoreForMatch') < screen.indexOf('await join(activeEvent.id, partyType)'),
    'appearance analysis must finish before participation is stored',
  );
});

test('matching sends invalid profile photos back to photo selection with an actionable reason', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');

  for (const code of [
    'photo_no_face',
    'photo_multiple_people',
    'photo_face_occluded',
    'photo_low_quality',
    'photo_minor_suspected',
  ]) {
    assert.match(screen, new RegExp(code));
  }
  assert.match(screen, /appearancePhotoIssueMessage/);
  assert.match(screen, /router\.push\('\/profile\/photos'\)/);
  assert.match(screen, /얼굴이 잘 보이는 본인 사진을 다시 올려 주세요/);
  assert.match(screen, /외모 분석 서버가 잠시 쉬고 있어요/);
});

test('matching shows truthful guided-event operations and V0 fallback copy', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');
  const summaryPath = path.join(process.cwd(), 'src/components/EventOperationsSummary.tsx');

  assert.ok(fs.existsSync(summaryPath), 'EventOperationsSummary must exist');
  const summary = fs.readFileSync(summaryPath, 'utf8');

  assert.match(screen, /EventOperationsSummary/);
  assert.match(summary, /capacityByGender/);
  assert.match(summary, /minimumCapacityTotal/);
  assert.match(summary, /T-120/);
  assert.match(summary, /T-90/);
  assert.match(summary, /T-60/);
  assert.match(summary, /T-20/);
  assert.match(summary, /T\+10/);
  assert.match(summary, /operations\.eventType === 'tonight'/);
  assert.match(summary, /1차/);
  assert.match(summary, /최종/);
  assert.match(summary, /운영 일정 확정 중/);
  assert.match(summary, /letterSpacing: 0/);
});

test('friend participation remains visibly blocked until friend teams exist', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');
  const bar = fs.readFileSync(path.join(process.cwd(), 'src/components/ParticipationBar.tsx'), 'utf8');

  assert.match(screen, /partyType === 'friends'/);
  assert.match(screen, /친구팀 연결 준비 중/);
  assert.match(bar, /친구팀 연결 준비 중/);
});

test('saved participation keeps the server party type as the visible source of truth', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');
  const bar = fs.readFileSync(path.join(process.cwd(), 'src/components/ParticipationBar.tsx'), 'utf8');

  assert.match(screen, /participation\?\.partyType/);
  assert.match(screen, /disabled=\{Boolean\(participation\)/);
  assert.match(bar, /participationPartyType/);
  assert.match(bar, /혼자 참여 중/);
});

test('meeting guide only exits after acknowledgement storage succeeds', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/meeting-guide.tsx'), 'utf8');
  const pager = fs.readFileSync(path.join(process.cwd(), 'src/components/MeetingGuidePager.tsx'), 'utf8');

  assert.doesNotMatch(screen, /finally\s*\{[\s\S]*exitGuide/);
  assert.match(screen, /안내 확인을 저장하지 못했어요/);
  assert.match(pager, /isFinishing/);
  assert.match(pager, /disabled=\{isFinishing\}/);
});

test('meeting guide image width comes from the measured card content', () => {
  const pager = fs.readFileSync(path.join(process.cwd(), 'src/components/MeetingGuidePager.tsx'), 'utf8');

  assert.match(pager, /onLayout=/);
  assert.match(pager, /layout\.width/);
  assert.doesNotMatch(pager, /Math\.min\(windowWidth, layout\.maxContentWidth\) - spacing\.lg \* 2/);
});

test('meeting guide renders animated speech bubbles one scene at a time', () => {
  const pager = fs.readFileSync(path.join(process.cwd(), 'src/components/MeetingGuidePager.tsx'), 'utf8');

  assert.match(pager, /scene\.dialogue\.map/);
  assert.match(pager, /Animated\.stagger/);
  assert.match(pager, /accessibilityLiveRegion="polite"/);
  assert.match(pager, /다 봐야 참여할 수 있어요/);
});

test('matching title does not claim five people for a six-person V1 event', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');

  assert.doesNotMatch(screen, /오늘 밤, 다섯 명이 만나요/);
  assert.match(screen, /오늘 밤, 활동으로 만나요/);
});

test('matching uses the approved photo-led scene switch copy', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/match.tsx'), 'utf8');

  assert.match(screen, /ImageBackground/);
  assert.match(screen, /오늘 바로/);
  assert.match(screen, /날짜 골라 만나기/);
  assert.match(screen, /오늘 바로 가볍게 만나기/);
  assert.match(screen, /원하는 날짜의 특별한 만남/);
  assert.match(screen, /accessibilityRole="tab"/);
  assert.match(screen, /accessibilityState=\{\{ selected: active \}\}/);
  assert.match(screen, /assets\/events\/jogging\.webp/);
  assert.match(screen, /assets\/events\/board-game\.webp/);
});

test('owned matching UI files keep Korean copy in UTF-8', () => {
  const ownedFiles = [
    'app/(tabs)/match.tsx',
    'src/components/ParticipationBar.tsx',
    'src/components/EventOperationsSummary.tsx',
    'src/state/meeting-guide-ack.ts',
  ];

  for (const file of ownedFiles) {
    const absolutePath = path.join(process.cwd(), file);
    assert.ok(fs.existsSync(absolutePath), `${file} must exist`);
    assert.doesNotMatch(fs.readFileSync(absolutePath, 'utf8'), /\uFFFD/);
  }
});
