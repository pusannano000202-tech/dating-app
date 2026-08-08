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
  assert.match(profile, /session\.user/);
  assert.match(profile, /signOut/);
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
