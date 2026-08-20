export type TonightEventKind = 'dinner' | 'jogging' | 'board-game' | 'drinks';

export type GuidedGender = 'male' | 'female';

export type GuidedEventActivityKind =
  | 'jogging'
  | 'walk'
  | 'workout'
  | 'board-game'
  | 'drinks'
  | 'dinner'
  | 'shopping'
  | 'exhibition'
  | 'outing';

export type GuidedEventStatus =
  | 'draft'
  | 'open'
  | 'full'
  | 'closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type GuidedEventPoint = {
  label: string;
  roadAddress: string | null;
  mapUrl: string | null;
};

export type GuidedEventParticipation = {
  participationId: string;
  eventId: string;
  partyType: 'solo' | 'friends';
  groupId: string | null;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show' | 'safety_exited';
  eventAlias: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TonightEventOperations = {
  serverTime: string;
  eventId: string;
  templateId: string;
  eventType: 'tonight' | 'scheduled';
  activityType: GuidedEventActivityKind;
  status: GuidedEventStatus;
  title: string;
  summary: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  checkInOpensAt: string;
  firstAssignmentAt: string;
  secondAssignmentAt: string;
  finalAssignmentAt: string;
  chatOpensAt: string;
  noShowReportOpensAt: string;
  timezone: 'Asia/Seoul';
  meetingPoint: GuidedEventPoint;
  endPoint: GuidedEventPoint;
  routeSummary: string | null;
  capacityTotal: 5 | 6;
  capacityByGender: {
    male: 3;
    female: 2 | 3;
  };
  minimumCapacityTotal: 3 | 4;
  minimumCapacityByGender: {
    male: 1;
    female: 1;
  };
  reducedCapacityRequiresConsent: true;
  remainingByGender: {
    male: number;
    female: number;
  };
  partyRules: {
    soloAllowed: true;
    friendsAllowed: true;
    maxPartySize: 3;
    sameGenderOnly: true;
    preserveFriendParty: true;
    fillOpenSeatsWithSameGenderSolo: true;
  };
  rules: string[];
  contactRules: {
    externalContactRequestAllowed: false;
    afterContactChannel: 'quantum_chat';
  };
  deposit: {
    amountKrw: 10000;
    policyVersion: string;
  };
  participation: GuidedEventParticipation | null;
  remainingTotal: number;
};

export type TonightEvent = {
  id: string;
  kind: TonightEventKind;
  scheduleType: 'tonight' | 'scheduled';
  eyebrow: string;
  title: string;
  description: string;
  venue: string;
  meetingTime: string;
  capacity: 5 | 6;
  remaining: number | null;
  imageKey: TonightEventKind;
  operations: TonightEventOperations | null;
};
