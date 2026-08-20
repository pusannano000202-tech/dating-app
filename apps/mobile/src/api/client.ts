import type {
  GuidedEventActivityKind,
  GuidedEventStatus,
  TonightEvent,
  TonightEventKind,
  TonightEventOperations,
} from '../domain/events';

export type QuantumPartyType = 'solo' | 'friends';

export type MobileParticipation = {
  eventId: string;
  eventMode: 'tonight' | 'scheduled';
  partyType: QuantumPartyType;
  updatedAt: string;
};

export type MobileProfileStep = 'basic' | 'worldcup' | 'survey' | 'photos' | 'complete';
export type MobileAppearanceStatus = 'not_requested' | 'pending' | 'ready' | 'failed' | 'stale' | 'unavailable';

export type MobileProfileSummary = {
  profile: {
    displayName: string;
    gender: 'male' | 'female';
    age: number;
    height: number | null;
    bodyType: 'slim' | 'average' | 'athletic' | 'chubby' | null;
    hairDensity: 'full' | 'thinning' | 'bald' | null;
    school: string;
    department: string | null;
    year: number | null;
  } | null;
  photoCount: number;
  appearanceStatus: MobileAppearanceStatus;
  nextStep: MobileProfileStep;
  isComplete: boolean;
};

export type MobileBasicProfileInput = {
  displayName: string;
  phone: string;
  gender: 'male' | 'female';
  age: number;
  height: number | null;
  bodyType: 'slim' | 'average' | 'athletic' | 'chubby' | null;
  hairDensity: 'full' | 'thinning' | 'bald' | null;
  school: string;
  department: string | null;
  year: number | null;
};

export type MobileAppearancePreparation = {
  reusedExistingScore: boolean;
};

export type MobileSurveyTraitKey = 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism';
export type MobileSurveyAnswers = Record<MobileSurveyTraitKey, [number, number]>;
export type MobileSurveyContract = {
  version: 'big5-short-v1';
  traits: Array<{ key: MobileSurveyTraitKey; label: string; questions: [string, string] }>;
};

export type MobileWorldcupContract = {
  version: 'appearance-worldcup-mobile-v1';
  candidateGender: 'male' | 'female';
  candidates: Array<{ id: string; imageUrl: string }>;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type QuantumApiClientOptions = {
  origin: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  allowInsecureLoopbackHttp?: boolean;
};

export class QuantumApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'QuantumApiError';
  }
}

export function createQuantumApiClient({
  origin,
  getAccessToken,
  fetchImpl = fetch,
  allowInsecureLoopbackHttp = process.env.NODE_ENV !== 'production',
}: QuantumApiClientOptions) {
  const apiOrigin = normalizeOrigin(origin, allowInsecureLoopbackHttp);

  async function request(path: string, init: RequestInit = {}, requireAuth = false): Promise<unknown> {
    const headers = new Headers(init.headers);
    const accessToken = await getAccessToken();

    if (requireAuth && !accessToken) throw new QuantumApiError('auth_required', 401);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetchImpl(`${apiOrigin}${path}`, { ...init, headers });
    } catch {
      throw new QuantumApiError('network_error');
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const code = readErrorCode(payload) ?? (response.status === 401 ? 'auth_required' : 'request_failed');
      throw new QuantumApiError(code, response.status);
    }
    return payload;
  }

  return {
    async listEvents(): Promise<{ tonight: TonightEvent[]; scheduled: TonightEvent[] }> {
      const payload = await request('/api/match/events');
      return parseEventCatalog(payload);
    },

    async getParticipation(): Promise<MobileParticipation | null> {
      const payload = await request('/api/match/event-participation', { cache: 'no-store' }, true);
      return parseParticipationEnvelope(payload, true);
    },

    async getProfileOnboarding(): Promise<MobileProfileSummary> {
      const payload = await request('/api/profile/onboarding', { cache: 'no-store' }, true);
      return parseProfileOnboarding(payload);
    },

    async saveBasicProfile(input: MobileBasicProfileInput): Promise<void> {
      const payload = await request(
        '/api/profile/basic',
        {
          method: 'PUT',
          body: JSON.stringify({
            display_name: input.displayName,
            phone: input.phone,
            gender: input.gender,
            age: input.age,
            height: input.height,
            body_type: input.bodyType,
            hair_density: input.hairDensity,
            school: input.school,
            department: input.department,
            year: input.year,
          }),
        },
        true,
      );
      if (!isRecord(payload) || payload.ok !== true) throw new QuantumApiError('invalid_response');
    },

    async prepareAppearanceScoreForMatch(): Promise<MobileAppearancePreparation> {
      const payload = await request(
        '/api/score',
        {
          method: 'POST',
          body: JSON.stringify({ trigger: 'match_search' }),
        },
        true,
      );
      if (
        !isRecord(payload)
        || payload.status !== 'ok'
        || payload.self_appearance_score_persisted !== true
        || hasOwn(payload, 'score')
        || hasOwn(payload, 'score_raw')
        || hasOwn(payload, 'score_normalized')
      ) {
        throw new QuantumApiError('invalid_response');
      }
      return { reusedExistingScore: payload.reused_existing_score === true };
    },

    async getProfileSurvey(): Promise<MobileSurveyContract> {
      const payload = await request('/api/profile/survey', { cache: 'no-store' }, true);
      return parseSurveyContract(payload);
    },

    async saveProfileSurvey(version: MobileSurveyContract['version'], answers: MobileSurveyAnswers): Promise<void> {
      const payload = await request(
        '/api/profile/survey',
        { method: 'PUT', body: JSON.stringify({ version, answers }) },
        true,
      );
      if (!isRecord(payload) || payload.ok !== true) throw new QuantumApiError('invalid_response');
    },

    async getProfileWorldcup(): Promise<MobileWorldcupContract> {
      const payload = await request('/api/profile/worldcup', { cache: 'no-store' }, true);
      return parseWorldcupContract(payload, apiOrigin);
    },

    async saveProfileWorldcup(version: MobileWorldcupContract['version'], winnerIds: string[]): Promise<void> {
      const payload = await request(
        '/api/profile/worldcup',
        { method: 'PUT', body: JSON.stringify({ version, winner_ids: winnerIds }) },
        true,
      );
      if (!isRecord(payload) || payload.ok !== true) throw new QuantumApiError('invalid_response');
    },

    async joinEvent(eventId: string, partyType: QuantumPartyType): Promise<MobileParticipation> {
      const payload = await request(
        '/api/match/event-participation',
        {
          method: 'POST',
          body: JSON.stringify({ event_id: eventId, party_type: partyType }),
        },
        true,
      );
      const participation = parseParticipationEnvelope(payload);
      if (!participation) throw new QuantumApiError('invalid_response');
      return participation;
    },

    async cancelParticipation(): Promise<void> {
      const payload = await request(
        '/api/match/event-participation',
        { method: 'DELETE' },
        true,
      );
      if (!isRecord(payload) || payload.participation !== null) {
        throw new QuantumApiError('invalid_response');
      }
    },
  };
}

const SURVEY_TRAIT_KEYS = new Set<MobileSurveyTraitKey>([
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
]);

function parseSurveyContract(value: unknown): MobileSurveyContract {
  if (!isRecord(value) || value.version !== 'big5-short-v1' || !Array.isArray(value.traits) || value.traits.length !== 5) {
    throw new QuantumApiError('invalid_response');
  }
  const traits = value.traits.map((trait) => {
    if (!isRecord(trait) || !SURVEY_TRAIT_KEYS.has(trait.key as MobileSurveyTraitKey)
      || !readString(trait.label) || !Array.isArray(trait.questions) || trait.questions.length !== 2
      || !trait.questions.every(readString)) {
      throw new QuantumApiError('invalid_response');
    }
    return {
      key: trait.key as MobileSurveyTraitKey,
      label: trait.label as string,
      questions: [trait.questions[0], trait.questions[1]] as [string, string],
    };
  });
  if (new Set(traits.map((trait) => trait.key)).size !== 5) throw new QuantumApiError('invalid_response');
  return { version: 'big5-short-v1', traits };
}

function parseWorldcupContract(value: unknown, apiOrigin: string): MobileWorldcupContract {
  if (!isRecord(value) || value.version !== 'appearance-worldcup-mobile-v1'
    || (value.candidate_gender !== 'male' && value.candidate_gender !== 'female')
    || !Array.isArray(value.candidates) || value.candidates.length !== 64) {
    throw new QuantumApiError('invalid_response');
  }
  const candidates = value.candidates.map((candidate) => {
    if (!isRecord(candidate) || !readString(candidate.id) || !readString(candidate.image_url)) {
      throw new QuantumApiError('invalid_response');
    }
    let imageUrl: string;
    try {
      imageUrl = new URL(candidate.image_url, apiOrigin).toString();
    } catch {
      throw new QuantumApiError('invalid_response');
    }
    if (!imageUrl.startsWith(`${apiOrigin}/appearance-ideal/`)) throw new QuantumApiError('invalid_response');
    return { id: candidate.id, imageUrl };
  });
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new QuantumApiError('invalid_response');
  }
  return {
    version: 'appearance-worldcup-mobile-v1',
    candidateGender: value.candidate_gender,
    candidates,
  };
}

function parseProfileOnboarding(value: unknown): MobileProfileSummary {
  if (!isRecord(value) || value.availability !== 'ready') throw new QuantumApiError('invalid_response');
  const photoCount = readInteger(value.photo_count, 0, Number.MAX_SAFE_INTEGER);
  const nextStep = parseProfileStep(value.next_step);
  const appearanceStatus = parseAppearanceStatus(value.appearance_status);
  const isComplete = typeof value.is_complete === 'boolean' ? value.is_complete : null;
  const profile = value.profile === null ? null : parseMobileProfile(value.profile);
  if (
    photoCount === undefined
    || !nextStep
    || !appearanceStatus
    || isComplete === null
    || profile === undefined
    || isComplete !== (nextStep === 'complete')
    || (profile === null && nextStep !== 'basic')
  ) throw new QuantumApiError('invalid_response');
  return { profile, photoCount, appearanceStatus, nextStep, isComplete };
}

function parseMobileProfile(value: unknown): MobileProfileSummary['profile'] | undefined {
  if (!isRecord(value)) return undefined;
  const displayName = readString(value.display_name) ? value.display_name : undefined;
  const gender = value.gender === 'male' || value.gender === 'female' ? value.gender : undefined;
  const age = readInteger(value.age, 18, 35);
  const height = value.height === null ? null : readInteger(value.height, 100, 250);
  const bodyType = value.body_type === null || value.body_type === 'slim' || value.body_type === 'average'
    || value.body_type === 'athletic' || value.body_type === 'chubby' ? value.body_type : undefined;
  const hairDensity = value.hair_density === null || value.hair_density === 'full'
    || value.hair_density === 'thinning' || value.hair_density === 'bald' ? value.hair_density : undefined;
  const school = readString(value.school) ? value.school : undefined;
  const department = readNullableString(value.department);
  const year = value.year === null ? null : readInteger(value.year, 1, 6);
  if (!displayName || !gender || age === undefined || height === undefined || bodyType === undefined
    || hairDensity === undefined || !school || department === undefined || year === undefined) return undefined;
  return { displayName, gender, age, height, bodyType, hairDensity, school, department, year };
}

function parseProfileStep(value: unknown): MobileProfileStep | null {
  return value === 'basic' || value === 'worldcup' || value === 'survey' || value === 'photos' || value === 'complete'
    ? value : null;
}

function parseAppearanceStatus(value: unknown): MobileAppearanceStatus | null {
  return value === 'not_requested' || value === 'pending' || value === 'ready' || value === 'failed'
    || value === 'stale' || value === 'unavailable' ? value : null;
}

function parseEventCatalog(value: unknown): { tonight: TonightEvent[]; scheduled: TonightEvent[] } {
  if (isRecord(value) && hasOwn(value, 'contract_version')) {
    if (value.contract_version !== 'quantum-guided-event-v1') {
      throw new QuantumApiError('invalid_response');
    }
    return parseGuidedEventCatalog(value);
  }

  if (!isRecord(value) || value.availability !== 'ready' || !isRecord(value.events)) {
    throw new QuantumApiError('invalid_response');
  }

  const tonight = parseEventList(value.events.tonight, 'tonight');
  const scheduled = parseEventList(value.events.scheduled, 'scheduled');
  return { tonight, scheduled };
}

function parseEventList(value: unknown, expectedMode: 'tonight' | 'scheduled'): TonightEvent[] {
  if (!Array.isArray(value)) throw new QuantumApiError('invalid_response');
  return value.map((event) => parseEvent(event, expectedMode));
}

function parseEvent(value: unknown, expectedMode: 'tonight' | 'scheduled'): TonightEvent {
  if (!isRecord(value)) throw new QuantumApiError('invalid_response');
  const kind = parseKind(value.kind);
  const remaining = value.remaining === null ? null : readInteger(value.remaining, 0, 5);

  if (
    !readString(value.id)
    || value.mode !== expectedMode
    || !readString(value.eyebrow)
    || !readString(value.title)
    || !readString(value.description)
    || !readString(value.location)
    || !readString(value.schedule)
    || value.total_people !== 5
    || !isBalancedCount(value.male_count)
    || !isBalancedCount(value.female_count)
    || Number(value.male_count) + Number(value.female_count) !== 5
    || !kind
    || remaining === undefined
  ) {
    throw new QuantumApiError('invalid_response');
  }

  return {
    id: value.id as string,
    kind: toMobileKind(kind),
    scheduleType: expectedMode,
    eyebrow: value.eyebrow as string,
    title: value.title as string,
    description: value.description as string,
    venue: value.location as string,
    meetingTime: value.schedule as string,
    capacity: 5,
    remaining,
    imageKey: toMobileKind(kind),
    operations: null,
  };
}

function parseGuidedEventCatalog(value: Record<string, unknown>): { tonight: TonightEvent[]; scheduled: TonightEvent[] } {
  const serverTime = readIsoDateTime(value.server_time);
  if (!serverTime || !Array.isArray(value.events)) {
    throw new QuantumApiError('invalid_response');
  }

  const tonight: TonightEvent[] = [];
  const scheduled: TonightEvent[] = [];
  for (const event of value.events) {
    const parsed = parseGuidedEvent(event, serverTime);
    if (parsed.scheduleType === 'tonight') {
      tonight.push(parsed);
    } else {
      scheduled.push(parsed);
    }
  }
  return { tonight, scheduled };
}

function parseGuidedEvent(value: unknown, serverTime: string): TonightEvent {
  if (!isRecord(value)) throw new QuantumApiError('invalid_response');

  const eventId = readString(value.event_id) ? value.event_id : undefined;
  const templateId = readString(value.template_id) ? value.template_id : undefined;
  const eventType = parseEventType(value.event_type);
  const activityType = parseGuidedActivityType(value.activity_type);
  const status = parseGuidedEventStatus(value.status);
  const imageUrl = readNullableString(value.image_url);
  const startsAt = readIsoDateTime(value.starts_at);
  const endsAt = readIsoDateTime(value.ends_at);
  const checkInOpensAt = readIsoDateTime(value.check_in_opens_at);
  const firstAssignmentAt = readIsoDateTime(value.first_assignment_at);
  const secondAssignmentAt = readIsoDateTime(value.second_assignment_at);
  const finalAssignmentAt = readIsoDateTime(value.final_assignment_at);
  const chatOpensAt = readIsoDateTime(value.chat_opens_at);
  const noShowReportOpensAt = readIsoDateTime(value.no_show_report_opens_at);
  const timezone = value.timezone === 'Asia/Seoul' ? value.timezone : null;
  const meetingPoint = parseMeetingPoint(value.meeting_point);
  const endPoint = parseMeetingPoint(value.end_point);
  const routeSummary = readNullableString(value.route_summary);
  const capacity = parseGuidedCapacity(value, activityType);
  const remainingByGender = parseRemainingByGender(value.remaining_by_gender, capacity);
  const partyRules = parsePartyRules(value.party_rules);
  const rules = parseRules(value.rules);
  const contactRules = parseContactRules(value.contact_rules);
  const deposit = parseDeposit(value.deposit);
  const participation = parseGuidedParticipation(value.participation, eventId);

  if (
    !eventId
    || !templateId
    || !eventType
    || !activityType
    || !status
    || imageUrl === undefined
    || !readString(value.title)
    || !readString(value.summary)
    || !startsAt
    || !endsAt
    || !checkInOpensAt
    || !firstAssignmentAt
    || !secondAssignmentAt
    || !finalAssignmentAt
    || !chatOpensAt
    || !noShowReportOpensAt
    || !timezone
    || !meetingPoint
    || !endPoint
    || routeSummary === undefined
    || !capacity
    || !remainingByGender
    || !partyRules
    || !rules
    || !contactRules
    || !deposit
    || participation === undefined
    || !hasValidGuidedSchedule({
      eventType,
      startsAt,
      endsAt,
      checkInOpensAt,
      firstAssignmentAt,
      secondAssignmentAt,
      finalAssignmentAt,
      chatOpensAt,
      noShowReportOpensAt,
    })
  ) {
    throw new QuantumApiError('invalid_response');
  }

  const operations: TonightEventOperations = {
    serverTime,
    eventId,
    templateId,
    eventType,
    activityType,
    status,
    title: value.title,
    summary: value.summary,
    imageUrl,
    startsAt,
    endsAt,
    checkInOpensAt,
    firstAssignmentAt,
    secondAssignmentAt,
    finalAssignmentAt,
    chatOpensAt,
    noShowReportOpensAt,
    timezone,
    meetingPoint,
    endPoint,
    routeSummary,
    capacityTotal: capacity.total,
    capacityByGender: capacity.byGender,
    minimumCapacityTotal: capacity.minimumTotal,
    minimumCapacityByGender: capacity.minimumByGender,
    reducedCapacityRequiresConsent: true,
    remainingByGender,
    partyRules,
    rules,
    contactRules,
    deposit,
    participation,
    remainingTotal: capacity.remainingTotal,
  };

  return {
    id: eventId,
    kind: toMobileKindFromActivity(activityType),
    scheduleType: eventType,
    eyebrow: status,
    title: value.title,
    description: value.summary,
    venue: meetingPoint.label,
    meetingTime: startsAt,
    capacity: capacity.total,
    remaining: capacity.remainingTotal,
    imageKey: toMobileKindFromActivity(activityType),
    operations,
  };
}

function parseParticipationEnvelope(value: unknown, requireReady = false): MobileParticipation | null {
  if (!isRecord(value)) throw new QuantumApiError('invalid_response');
  if (requireReady && value.availability !== 'ready') {
    throw new QuantumApiError(readString(value.availability) ? value.availability : 'invalid_response');
  }
  if (value.participation === null) return null;
  if (!isRecord(value.participation)) throw new QuantumApiError('invalid_response');

  const participation = value.participation;
  if (
    !readString(participation.event_id)
    || (participation.event_mode !== 'tonight' && participation.event_mode !== 'scheduled')
    || (participation.party_type !== 'solo' && participation.party_type !== 'friends')
    || !readString(participation.updated_at)
  ) {
    throw new QuantumApiError('invalid_response');
  }

  return {
    eventId: participation.event_id as string,
    eventMode: participation.event_mode,
    partyType: participation.party_type,
    updatedAt: participation.updated_at as string,
  };
}

function parseKind(value: unknown): 'run' | 'walk' | 'board-game' | 'drinks' | 'dinner' | null {
  return value === 'run' || value === 'walk' || value === 'board-game' || value === 'drinks' || value === 'dinner'
    ? value
    : null;
}

function toMobileKind(kind: 'run' | 'walk' | 'board-game' | 'drinks' | 'dinner'): TonightEventKind {
  return kind === 'run' || kind === 'walk' ? 'jogging' : kind;
}

function parseEventType(value: unknown): 'tonight' | 'scheduled' | null {
  return value === 'tonight' || value === 'scheduled' ? value : null;
}

function parseGuidedActivityType(value: unknown): GuidedEventActivityKind | null {
  switch (value) {
    case 'jogging':
    case 'walk':
    case 'workout':
    case 'dinner':
    case 'drinks':
    case 'shopping':
    case 'exhibition':
    case 'outing':
      return value;
    case 'board_game':
      return 'board-game';
    default:
      return null;
  }
}

function parseGuidedEventStatus(value: unknown): GuidedEventStatus | null {
  return value === 'draft'
    || value === 'open'
    || value === 'full'
    || value === 'closed'
    || value === 'in_progress'
    || value === 'completed'
    || value === 'cancelled'
    ? value
    : null;
}

function toMobileKindFromActivity(activityType: GuidedEventActivityKind): TonightEventKind {
  return activityType === 'jogging'
    || activityType === 'walk'
    || activityType === 'workout'
    || activityType === 'shopping'
    || activityType === 'exhibition'
    || activityType === 'outing'
    ? 'jogging'
    : activityType;
}

function parseMeetingPoint(value: unknown): TonightEventOperations['meetingPoint'] | null {
  if (!isRecord(value) || !readString(value.label)) return null;
  const roadAddress = readNullableString(value.road_address);
  const mapUrl = readNullableString(value.map_url);
  if (roadAddress === undefined || mapUrl === undefined) return null;
  return {
    label: value.label,
    roadAddress,
    mapUrl,
  };
}

function parseGuidedCapacity(value: Record<string, unknown>, activityType: GuidedEventActivityKind | null): {
  total: 5 | 6;
  byGender: TonightEventOperations['capacityByGender'];
  minimumTotal: 3 | 4;
  minimumByGender: TonightEventOperations['minimumCapacityByGender'];
  remainingTotal: number;
} | null {
  const total = value.capacity_total === 5 || value.capacity_total === 6 ? value.capacity_total : null;
  const byGender = value.capacity_by_gender;
  const minimumTotal = value.minimum_capacity_total === 3 || value.minimum_capacity_total === 4
    ? value.minimum_capacity_total
    : null;
  const minimumByGender = value.minimum_capacity_by_gender;
  const remainingTotal = readInteger(value.remaining_total, 0, 6);

  if (
    !total
    || !isRecord(byGender)
    || byGender.male !== 3
    || (byGender.female !== 2 && byGender.female !== 3)
    || byGender.male + byGender.female !== total
    || !minimumTotal
    || !isRecord(minimumByGender)
    || minimumByGender.male !== 1
    || minimumByGender.female !== 1
    || value.reduced_capacity_requires_consent !== true
    || remainingTotal === undefined
    || remainingTotal > total
    || !activityType
    || minimumTotal !== (activityType === 'board-game' ? 4 : 3)
  ) {
    return null;
  }

  return {
    total,
    byGender: { male: 3, female: byGender.female },
    minimumTotal,
    minimumByGender: { male: 1, female: 1 },
    remainingTotal,
  };
}

function parseRemainingByGender(
  value: unknown,
  capacity: ReturnType<typeof parseGuidedCapacity>,
): TonightEventOperations['remainingByGender'] | null {
  if (!capacity || !isRecord(value)) return null;
  const male = readInteger(value.male, 0, capacity.byGender.male);
  const female = readInteger(value.female, 0, capacity.byGender.female);
  if (male === undefined || female === undefined || male + female !== capacity.remainingTotal) {
    return null;
  }
  return { male, female };
}

function parsePartyRules(value: unknown): TonightEventOperations['partyRules'] | null {
  if (
    !isRecord(value)
    || value.solo_allowed !== true
    || value.friends_allowed !== true
    || value.max_party_size !== 3
    || value.same_gender_only !== true
    || value.preserve_friend_party !== true
    || value.fill_open_seats_with_same_gender_solo !== true
  ) {
    return null;
  }
  return {
    soloAllowed: true,
    friendsAllowed: true,
    maxPartySize: 3,
    sameGenderOnly: true,
    preserveFriendParty: true,
    fillOpenSeatsWithSameGenderSolo: true,
  };
}

function parseRules(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(readString) ? [...value] : null;
}

function parseContactRules(value: unknown): TonightEventOperations['contactRules'] | null {
  if (
    !isRecord(value)
    || value.external_contact_request_allowed !== false
    || value.after_contact_channel !== 'quantum_chat'
  ) {
    return null;
  }
  return {
    externalContactRequestAllowed: false,
    afterContactChannel: 'quantum_chat',
  };
}

function parseDeposit(value: unknown): TonightEventOperations['deposit'] | null {
  if (!isRecord(value) || value.amount_krw !== 10000 || !readString(value.policy_version)) {
    return null;
  }
  return {
    amountKrw: 10000,
    policyVersion: value.policy_version,
  };
}

function parseGuidedParticipation(
  value: unknown,
  expectedEventId: string | undefined,
): TonightEventOperations['participation'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !expectedEventId) return undefined;

  const participationId = readString(value.participation_id) ? value.participation_id : undefined;
  const eventId = readString(value.event_id) ? value.event_id : undefined;
  const partyType = value.party_type === 'solo' || value.party_type === 'friends' ? value.party_type : undefined;
  const groupId = readNullableString(value.group_id);
  const status = parseParticipationStatus(value.status);
  const eventAlias = readNullableString(value.event_alias);
  const createdAt = readIsoDateTime(value.created_at);
  const updatedAt = readIsoDateTime(value.updated_at);
  const aliasRequired = status === 'confirmed'
    || status === 'checked_in'
    || status === 'completed'
    || status === 'no_show'
    || status === 'safety_exited';

  if (
    !participationId
    || eventId !== expectedEventId
    || !partyType
    || groupId === undefined
    || (partyType === 'solo' && groupId !== null)
    || (partyType === 'friends' && !groupId)
    || !status
    || eventAlias === undefined
    || !createdAt
    || !updatedAt
    || Date.parse(updatedAt) < Date.parse(createdAt)
    || (status === 'pending' && eventAlias !== null)
    || (aliasRequired && eventAlias === null)
  ) {
    return undefined;
  }

  return {
    participationId,
    eventId,
    partyType,
    groupId,
    status,
    eventAlias,
    createdAt,
    updatedAt,
  };
}

function parseParticipationStatus(value: unknown):
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'safety_exited'
  | null {
  return value === 'pending'
    || value === 'confirmed'
    || value === 'checked_in'
    || value === 'completed'
    || value === 'cancelled'
    || value === 'no_show'
    || value === 'safety_exited'
    ? value
    : null;
}

function hasValidGuidedSchedule(value: {
  eventType: 'tonight' | 'scheduled';
  startsAt: string;
  endsAt: string;
  checkInOpensAt: string;
  firstAssignmentAt: string;
  secondAssignmentAt: string;
  finalAssignmentAt: string;
  chatOpensAt: string;
  noShowReportOpensAt: string;
}): boolean {
  const minute = 60_000;
  const startsAt = Date.parse(value.startsAt);
  const endsAt = Date.parse(value.endsAt);
  const checkInOpensAt = Date.parse(value.checkInOpensAt);
  const firstAssignmentAt = Date.parse(value.firstAssignmentAt);
  const secondAssignmentAt = Date.parse(value.secondAssignmentAt);
  const finalAssignmentAt = Date.parse(value.finalAssignmentAt);
  const chatOpensAt = Date.parse(value.chatOpensAt);
  const noShowReportOpensAt = Date.parse(value.noShowReportOpensAt);
  const hasRequiredTonightOffsets = value.eventType !== 'tonight' || (
    startsAt - firstAssignmentAt === 120 * minute
    && startsAt - secondAssignmentAt === 90 * minute
    && startsAt - finalAssignmentAt === 60 * minute
    && startsAt - chatOpensAt === 20 * minute
    && noShowReportOpensAt - startsAt === 10 * minute
  );
  return endsAt > startsAt
    && hasRequiredTonightOffsets
    && firstAssignmentAt < secondAssignmentAt
    && secondAssignmentAt < finalAssignmentAt
    && finalAssignmentAt < checkInOpensAt
    && checkInOpensAt < chatOpensAt
    && chatOpensAt < startsAt
    && startsAt < noShowReportOpensAt
    && noShowReportOpensAt < endsAt;
}

function isBalancedCount(value: unknown): value is 2 | 3 {
  return value === 2 || value === 3;
}

function readInteger(value: unknown, min: number, max: number): number | undefined {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : undefined;
}

function readString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readString(value) ? value : undefined;
}

function readIsoDateTime(value: unknown): string | undefined {
  if (!readString(value)) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[8];
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  if (
    year < 1
    || day < 1
    || day > daysInMonth
    || hour > 23
    || minute > 59
    || second > 59
  ) return undefined;

  if (offset !== 'Z' && offset !== 'z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return undefined;
  }
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function readErrorCode(value: unknown): string | null {
  return isRecord(value) && readString(value.error) ? value.error : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeOrigin(origin: string, allowInsecureLoopbackHttp: boolean): string {
  const normalized = origin.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new QuantumApiError('invalid_api_origin');
  }
  if (url.username || url.password || url.search || url.hash) throw new QuantumApiError('invalid_api_origin');
  const isLoopback = url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(allowInsecureLoopbackHttp && url.protocol === 'http:' && isLoopback)) {
    throw new QuantumApiError('invalid_api_origin');
  }
  return normalized;
}
