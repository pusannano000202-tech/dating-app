import assert from 'node:assert/strict';
import test from 'node:test';

import { formatEventMeetingTime } from '../src/domain/event-display';

test('guided event ISO time is rendered as a compact Korean meeting time', () => {
  const result = formatEventMeetingTime('2026-08-09T20:00:00+09:00');

  assert.match(result, /8\.\s*9/);
  assert.match(result, /20:00/);
});

test('legacy human-readable meeting time remains unchanged', () => {
  assert.equal(formatEventMeetingTime('오늘 20:30'), '오늘 20:30');
});
