import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getGuidedActivityMinimum,
  hasGuidedActivityMinimum,
  createGuidedEventTimeline,
  planGuidedPartyWithCapacity,
  planGuidedParty,
  resolveGuidedMilestone,
  type GuidedPartyPlanResult,
} from '../src/domain/guided-event-policy';

const baseUtcStart = '2026-08-12T10:00:00Z';

function shiftMinutes(baseIso: string, minutes: number): string {
  return new Date(Date.parse(baseIso) + minutes * 60 * 1000).toISOString();
}

function shiftMilliseconds(baseIso: string, milliseconds: number): string {
  return new Date(Date.parse(baseIso) + milliseconds).toISOString();
}

const MINUTE_MS = 60 * 1000;
const BOUNDARIES = {
  firstAssignmentMs: 120 * MINUTE_MS,
  secondAssignmentMs: 90 * MINUTE_MS,
  finalAssignmentMs: 60 * MINUTE_MS,
  chatOpenMs: 20 * MINUTE_MS,
  noShowMs: -10 * MINUTE_MS,
};

test('default guided target is male3/female2', () => {
  const result = planGuidedParty({}) as GuidedPartyPlanResult;
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.target.male, 3);
  assert.equal(result.target.female, 2);
  assert.deepEqual(result.allocation, {
    friendParty: { male: 0, female: 0 },
    sameGenderSoloSlots: { male: 3, female: 2 },
  });
});

test('friend party of size 2~3 is preserved and filled by same-gender solo seats', () => {
  const maleResult = planGuidedParty({
    friendParty: { size: 3, gender: 'male' },
  }) as GuidedPartyPlanResult;
  assert.equal(maleResult.ok, true);
  if (!maleResult.ok) return;
  assert.equal(maleResult.allocation.friendParty.male, 3);
  assert.equal(maleResult.allocation.friendParty.female, 0);
  assert.equal(maleResult.allocation.sameGenderSoloSlots.male, 0);
  assert.equal(maleResult.allocation.sameGenderSoloSlots.female, 2);

  const femaleResult = planGuidedParty({
    friendParty: { size: 2, gender: 'female' },
  }) as GuidedPartyPlanResult;
  assert.equal(femaleResult.ok, true);
  if (!femaleResult.ok) return;
  assert.equal(femaleResult.allocation.friendParty.male, 0);
  assert.equal(femaleResult.allocation.friendParty.female, 2);
  assert.equal(femaleResult.allocation.sameGenderSoloSlots.female, 0);
  assert.equal(femaleResult.allocation.sameGenderSoloSlots.male, 3);
});

test('female friend size 3 upgrades target to male3/female3 without rejecting party', () => {
  const result = planGuidedParty({
    friendParty: { size: 3, gender: 'female' },
  }) as GuidedPartyPlanResult;
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.target, { male: 3, female: 3 });
  assert.deepEqual(result.allocation, {
    friendParty: { male: 0, female: 3 },
    sameGenderSoloSlots: { male: 3, female: 0 },
  });
});

test('female party size 3 can produce male3/female3 but standalone base target 3:3 is invalid', () => {
  const upgraded = planGuidedParty({
    friendParty: { size: 3, gender: 'female' },
  }) as GuidedPartyPlanResult;
  assert.equal(upgraded.ok, true);
  if (!upgraded.ok) return;
  assert.equal(upgraded.target.male, 3);
  assert.equal(upgraded.target.female, 3);

  const invalidBaseTarget = planGuidedPartyWithCapacity({
    baseTarget: { male: 3, female: 3 },
  });
  assert.equal(invalidBaseTarget.ok, false);
  if (!invalidBaseTarget.ok) assert.equal(invalidBaseTarget.reason, 'invalid_capacity');
});

test('female-majority configuration is rejected', () => {
  const invalidBase = planGuidedPartyWithCapacity({
    baseTarget: { male: 2, female: 3 },
  });
  assert.equal(invalidBase.ok, false);
});

test('public target 2:2 is rejected', () => {
  const invalidBase = planGuidedPartyWithCapacity({
    baseTarget: { male: 2, female: 2 },
  });
  assert.equal(invalidBase.ok, false);
  if (!invalidBase.ok) {
    assert.equal(invalidBase.reason, 'invalid_capacity');
  }
});

test('invalid friend party size is rejected', () => {
  const invalid = planGuidedParty({
    friendParty: { size: 1, gender: 'male' } as { size: 1; gender: 'male' },
  }) as GuidedPartyPlanResult;
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.reason, 'invalid_friend_party');
  }
});

test('runtime invalid friend party gender is rejected', () => {
  const invalid = planGuidedPartyWithCapacity({
    friendParty: { size: 2, gender: 'nonbinary' as unknown as 'male' },
  } as { baseTarget?: { male: number; female: number }; friendParty?: { size: number; gender: string } });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.reason, 'invalid_friend_party');
});

test('activity minimum is 3 except board-game requires 4, and requires mixed genders', () => {
  assert.equal(getGuidedActivityMinimum('board-game'), 4);
  assert.equal(getGuidedActivityMinimum('jogging'), 3);
  assert.equal(getGuidedActivityMinimum('walk'), 3);
  assert.equal(getGuidedActivityMinimum('workout'), 3);
  assert.equal(getGuidedActivityMinimum('drinks'), 3);
  assert.equal(getGuidedActivityMinimum('dinner'), 3);

  assert.equal(
    hasGuidedActivityMinimum({
      activity: 'board-game',
      maleParticipants: 2,
      femaleParticipants: 2,
    }),
    true,
  );
  assert.equal(
    hasGuidedActivityMinimum({
      activity: 'board-game',
      maleParticipants: 4,
      femaleParticipants: 0,
    }),
    false,
  );

  assert.equal(
    hasGuidedActivityMinimum({
      activity: 'board-game',
      maleParticipants: 2,
      femaleParticipants: 4,
    }),
    false,
  );
  assert.equal(
    hasGuidedActivityMinimum({
      activity: 'walk',
      maleParticipants: 1.5,
      femaleParticipants: 1,
    }),
    false,
  );
  assert.equal(
    hasGuidedActivityMinimum({
      activity: 'drinks',
      maleParticipants: -1,
      femaleParticipants: 2,
    }),
    false,
  );

  assert.equal(
    hasGuidedActivityMinimum({
      activity: 'tabletop' as unknown as string,
      maleParticipants: 2,
      femaleParticipants: 1,
    }),
    false,
  );
  assert.throws(
    () => getGuidedActivityMinimum('tabletop' as unknown as string),
    /Unsupported guided activity/,
  );
});

test('scheduled shopping, exhibition, and outing activities use the mixed three-person minimum', () => {
  for (const activity of ['shopping', 'exhibition', 'outing'] as const) {
    assert.equal(getGuidedActivityMinimum(activity), 3);
    assert.equal(hasGuidedActivityMinimum({ activity, maleParticipants: 2, femaleParticipants: 1 }), true);
  }
});

test('timeline milestones follow T-120, T-90, T-60, T-20, and T+10', () => {
  const timeline = createGuidedEventTimeline(baseUtcStart);

  assert.equal(
    resolveGuidedMilestone({ startAt: baseUtcStart, now: shiftMinutes(baseUtcStart, -120) }),
    'first_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({ startAt: baseUtcStart, now: shiftMinutes(baseUtcStart, -90) }),
    'second_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({ startAt: baseUtcStart, now: shiftMinutes(baseUtcStart, -60) }),
    'final_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({ startAt: baseUtcStart, now: shiftMinutes(baseUtcStart, -20) }),
    'chat_open',
  );
  assert.equal(
    resolveGuidedMilestone({ startAt: baseUtcStart, now: shiftMinutes(baseUtcStart, 10) }),
    'no_show_report_open',
  );

  assert.equal(timeline.firstAssignmentAt, '2026-08-12T08:00:00.000Z');
  assert.equal(timeline.secondAssignmentAt, '2026-08-12T08:30:00.000Z');
  assert.equal(timeline.finalAssignmentAt, '2026-08-12T09:00:00.000Z');
  assert.equal(timeline.chatOpenAt, '2026-08-12T09:40:00.000Z');
  assert.equal(timeline.noShowReportAt, '2026-08-12T10:10:00.000Z');
});

test('resolveGuidedMilestone switches exactly at T-120, T-90, T-60, T-20 and T+10 by milliseconds', () => {
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.firstAssignmentMs - 1),
    }),
    'before_first_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.firstAssignmentMs),
    }),
    'first_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.firstAssignmentMs + 1),
    }),
    'first_assignment',
  );

  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.secondAssignmentMs - 1),
    }),
    'first_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.secondAssignmentMs),
    }),
    'second_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.secondAssignmentMs + 1),
    }),
    'second_assignment',
  );

  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.finalAssignmentMs - 1),
    }),
    'second_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.finalAssignmentMs),
    }),
    'final_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.finalAssignmentMs + 1),
    }),
    'final_assignment',
  );

  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.chatOpenMs - 1),
    }),
    'final_assignment',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.chatOpenMs),
    }),
    'chat_open',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.chatOpenMs + 1),
    }),
    'chat_open',
  );

  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.noShowMs - 1),
    }),
    'chat_open',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.noShowMs),
    }),
    'no_show_report_open',
  );
  assert.equal(
    resolveGuidedMilestone({
      startAt: baseUtcStart,
      now: shiftMilliseconds(baseUtcStart, -BOUNDARIES.noShowMs + 1),
    }),
    'no_show_report_open',
  );
});
