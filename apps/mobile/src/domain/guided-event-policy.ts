import {
  type GuidedEventActivityKind,
  type GuidedGender,
} from './events';

export type GuidedMilestone =
  | 'before_first_assignment'
  | 'first_assignment'
  | 'second_assignment'
  | 'final_assignment'
  | 'chat_open'
  | 'no_show_report_open';

export type GuidedFriendPartySize = 2 | 3;

export interface GuidedFriendParty {
  size: GuidedFriendPartySize;
  gender: GuidedGender;
}

export interface GuidedPartyTarget {
  male: number;
  female: number;
}

export interface GuidedPartyAllocation {
  friendParty: {
    male: number;
    female: number;
  };
  sameGenderSoloSlots: {
    male: number;
    female: number;
  };
}

export type GuidedPartyPlanResult =
  | { ok: true; target: GuidedPartyTarget; allocation: GuidedPartyAllocation }
  | { ok: false; reason: 'invalid_friend_party' | 'invalid_capacity' | 'female_exceeds_male' };

export interface GuidedActivityMinimum {
  activity: GuidedEventActivityKind;
  minimumMixedParticipants: 3 | 4;
}

export interface GuidedEventTimeline {
  firstAssignmentAt: string;
  secondAssignmentAt: string;
  finalAssignmentAt: string;
  chatOpenAt: string;
  noShowReportAt: string;
}

export interface GuidedMilestoneInput {
  startAt: string | Date;
  now: string | Date;
}

const MINUTE_MS = 60 * 1000;
const ONE_HUNDRED_TWENTY_MINUTES_MS = 120 * MINUTE_MS;
const NINETY_MINUTES_MS = 90 * MINUTE_MS;
const SIXTY_MINUTES_MS = 60 * MINUTE_MS;
const TWENTY_MINUTES_MS = 20 * MINUTE_MS;
const TEN_MINUTES_MS = 10 * MINUTE_MS;

const DEFAULT_TARGET: GuidedPartyTarget = { male: 3, female: 2 };
const VALID_PUBLIC_TARGETS: ReadonlySet<string> = new Set(['3:2']);
const VALID_ACTIVITIES: ReadonlySet<GuidedEventActivityKind> = new Set([
  'jogging',
  'walk',
  'workout',
  'board-game',
  'drinks',
  'dinner',
  'shopping',
  'exhibition',
  'outing',
]);

function isGuidedGender(value: unknown): value is GuidedGender {
  return value === 'male' || value === 'female';
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isGuidedActivity(activity: unknown): activity is GuidedEventActivityKind {
  return VALID_ACTIVITIES.has(activity as GuidedEventActivityKind);
}

function isPublicCapacity(baseTarget: GuidedPartyTarget): boolean {
  return VALID_PUBLIC_TARGETS.has(`${baseTarget.male}:${baseTarget.female}`);
}

function parseDate(value: string | Date, label: string): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid ISO datetime`);
  }
  return parsed;
}

export function getDefaultGuidedPartyTarget(): GuidedPartyTarget {
  return { ...DEFAULT_TARGET };
}

export function buildGuidedFriendAllocation(
  target: GuidedPartyTarget,
  friendParty?: GuidedFriendParty,
): GuidedPartyAllocation {
  const friendPartyCounts = { male: 0, female: 0 };
  if (friendParty) {
    if (friendParty.gender === 'male') {
      friendPartyCounts.male = friendParty.size;
    } else {
      friendPartyCounts.female = friendParty.size;
    }
  }

  return {
    friendParty: friendPartyCounts,
    sameGenderSoloSlots: {
      male: target.male - friendPartyCounts.male,
      female: target.female - friendPartyCounts.female,
    },
  };
}

export function planGuidedParty(input: { friendParty?: GuidedFriendParty }): GuidedPartyPlanResult {
  return planGuidedPartyWithCapacity({
    baseTarget: DEFAULT_TARGET,
    ...input,
  });
}

export function planGuidedPartyWithCapacity(
  input: { baseTarget?: GuidedPartyTarget; friendParty?: GuidedFriendParty },
): GuidedPartyPlanResult {
  const base = input.baseTarget ? { ...input.baseTarget } : getDefaultGuidedPartyTarget();
  if (!isPublicCapacity(base)) {
    return { ok: false, reason: 'invalid_capacity' };
  }

  if (base.male === 3 && base.female === 3) {
    return { ok: false, reason: 'invalid_capacity' };
  }

  const target: GuidedPartyTarget = { ...base };
  if (input.friendParty) {
    const { size, gender } = input.friendParty;
    if (!isGuidedGender(gender)) {
      return { ok: false, reason: 'invalid_friend_party' };
    }
    if (size !== 2 && size !== 3) {
      return { ok: false, reason: 'invalid_friend_party' };
    }
    if (gender === 'female' && size > target.female) {
      target.female = 3;
    }
    if (gender === 'male' && size > target.male) {
      target.male = 3;
    }
  }

  if (target.female > target.male) {
    return { ok: false, reason: 'female_exceeds_male' };
  }

  if (
    target.female > 3
    || target.male > 3
    || target.female < 2
    || target.male < 2
  ) {
    return { ok: false, reason: 'invalid_capacity' };
  }

  const allocation = buildGuidedFriendAllocation(target, input.friendParty);
  if (allocation.friendParty.male > target.male || allocation.friendParty.female > target.female) {
    return { ok: false, reason: 'invalid_friend_party' };
  }
  if (allocation.sameGenderSoloSlots.male < 0 || allocation.sameGenderSoloSlots.female < 0) {
    return { ok: false, reason: 'invalid_friend_party' };
  }

  return { ok: true, target, allocation };
}

export function getGuidedActivityMinimum(target: GuidedEventActivityKind): 3 | 4 {
  if (!isGuidedActivity(target)) {
    throw new Error('Unsupported guided activity');
  }
  return target === 'board-game' ? 4 : 3;
}

export function hasGuidedActivityMinimum({
  activity,
  maleParticipants,
  femaleParticipants,
}: {
  activity: GuidedEventActivityKind;
  maleParticipants: number;
  femaleParticipants: number;
}): boolean {
  if (!isGuidedActivity(activity)) {
    return false;
  }

  if (!isNonNegativeInteger(maleParticipants) || !isNonNegativeInteger(femaleParticipants)) {
    return false;
  }
  if (femaleParticipants > maleParticipants) {
    return false;
  }
  const minimum = getGuidedActivityMinimum(activity);
  const totalParticipants = maleParticipants + femaleParticipants;
  const hasBothGenders = maleParticipants > 0 && femaleParticipants > 0;
  return totalParticipants >= minimum && hasBothGenders;
}

export function createGuidedEventTimeline(startAt: string | Date): GuidedEventTimeline {
  const start = parseDate(startAt, 'startAt');
  return {
    firstAssignmentAt: new Date(start - ONE_HUNDRED_TWENTY_MINUTES_MS).toISOString(),
    secondAssignmentAt: new Date(start - NINETY_MINUTES_MS).toISOString(),
    finalAssignmentAt: new Date(start - SIXTY_MINUTES_MS).toISOString(),
    chatOpenAt: new Date(start - TWENTY_MINUTES_MS).toISOString(),
    noShowReportAt: new Date(start + TEN_MINUTES_MS).toISOString(),
  };
}

export function resolveGuidedMilestone(input: GuidedMilestoneInput): GuidedMilestone {
  const startTime = parseDate(input.startAt, 'startAt');
  const now = parseDate(input.now, 'now');
  const millisecondsToStart = startTime - now;

  if (millisecondsToStart > ONE_HUNDRED_TWENTY_MINUTES_MS) return 'before_first_assignment';
  if (millisecondsToStart > NINETY_MINUTES_MS) return 'first_assignment';
  if (millisecondsToStart > SIXTY_MINUTES_MS) return 'second_assignment';
  if (millisecondsToStart > TWENTY_MINUTES_MS) return 'final_assignment';
  if (millisecondsToStart > -TEN_MINUTES_MS) return 'chat_open';
  return 'no_show_report_open';
}
