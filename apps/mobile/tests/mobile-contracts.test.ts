import assert from 'node:assert/strict';
import test from 'node:test';

import { scheduledEvents, tonightEvents } from '../src/domain/events';
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

test('tonight activities use stable unique ids and one five-person format', () => {
  assert.ok(tonightEvents.length >= 4);
  assert.equal(new Set(tonightEvents.map((event) => event.id)).size, tonightEvents.length);

  for (const event of tonightEvents) {
    assert.equal(event.capacity, 5);
    assert.match(event.meetingTime, /^오늘 \d{1,2}:\d{2}$/);
  }
});

test('scheduled activities use the same five-person cylinder contract', () => {
  assert.ok(scheduledEvents.length >= 4);

  const allEvents = [...tonightEvents, ...scheduledEvents];
  assert.equal(new Set(allEvents.map((event) => event.id)).size, allEvents.length);

  for (const event of scheduledEvents) {
    assert.equal(event.capacity, 5);
    assert.equal(event.scheduleType, 'scheduled');
    assert.match(event.meetingTime, /^8월 \d{1,2}일/);
  }
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
