import assert from 'node:assert/strict';
import test from 'node:test';

import { createQuantumApiClient, QuantumApiError } from '../src/api/client';

const catalogPayload = {
  availability: 'ready',
  events: {
    tonight: [
      {
        id: 'tonight-board-game',
        mode: 'tonight',
        kind: 'board-game',
        eyebrow: '말문이 쉽게 트이는 밤',
        title: '장전동 보드게임',
        description: '규칙이 쉬운 게임부터 시작해요.',
        location: '부산대 정문 앞',
        schedule: '오늘 20:00',
        total_people: 5,
        male_count: 2,
        female_count: 3,
        remaining: null,
      },
    ],
    scheduled: [],
  },
};

const guidedEventCatalogPayload = {
  contract_version: 'quantum-guided-event-v1',
  server_time: '2026-08-09T12:00:00+09:00',
  events: [
    {
      event_id: 'event-walk-2026-08-09',
      template_id: 'tonight-campus-walk',
      event_type: 'tonight',
      activity_type: 'walk',
      status: 'open',
      title: 'Campus walk',
      summary: 'A guided evening walk.',
      image_url: null,
      starts_at: '2026-08-09T20:00:00+09:00',
      ends_at: '2026-08-09T21:30:00+09:00',
      check_in_opens_at: '2026-08-09T19:30:00+09:00',
      first_assignment_at: '2026-08-09T18:00:00+09:00',
      second_assignment_at: '2026-08-09T18:30:00+09:00',
      final_assignment_at: '2026-08-09T19:00:00+09:00',
      chat_opens_at: '2026-08-09T19:40:00+09:00',
      no_show_report_opens_at: '2026-08-09T20:10:00+09:00',
      timezone: 'Asia/Seoul',
      meeting_point: {
        label: 'PNU gate',
        road_address: null,
        map_url: null,
      },
      end_point: {
        label: 'PNU station',
        road_address: 'Busan Geumjeong-gu Jangjeon-ro 12',
        map_url: 'https://map.example.test/pnu-station',
      },
      route_summary: 'Walk together from the gate to the station.',
      capacity_total: 5,
      capacity_by_gender: { male: 3, female: 2 },
      minimum_capacity_total: 3,
      minimum_capacity_by_gender: { male: 1, female: 1 },
      reduced_capacity_requires_consent: true,
      remaining_by_gender: { male: 1, female: 1 },
      party_rules: {
        solo_allowed: true,
        friends_allowed: true,
        max_party_size: 3,
        same_gender_only: true,
        preserve_friend_party: true,
        fill_open_seats_with_same_gender_solo: true,
      },
      rules: ['Use Quantum chat for contact.'],
      contact_rules: {
        external_contact_request_allowed: false,
        after_contact_channel: 'quantum_chat',
      },
      deposit: {
        amount_krw: 10000,
        policy_version: 'guided-event-deposit-v1',
      },
      participation: {
        participation_id: 'participation-walk-1',
        event_id: 'event-walk-2026-08-09',
        party_type: 'solo',
        group_id: null,
        status: 'pending',
        event_alias: null,
        created_at: '2026-08-09T12:01:00+09:00',
        updated_at: '2026-08-09T12:01:00+09:00',
      },
      remaining_total: 2,
    },
  ],
};

test('public event catalog is loaded without an access token', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app/',
    getAccessToken: async () => null,
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(catalogPayload);
    },
  });

  const catalog = await client.listEvents();

  assert.equal(calls[0]?.url, 'https://dating-app-silk.vercel.app/api/match/events');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), null);
  assert.equal(catalog.tonight[0]?.id, 'tonight-board-game');
  assert.equal(catalog.tonight[0]?.imageKey, 'board-game');
  assert.equal(catalog.tonight[0]?.operations, null);
});

test('V1 guided event catalog retains server operations and falls back walk artwork safely', async () => {
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(guidedEventCatalogPayload),
  });

  const catalog = await client.listEvents();
  const event = catalog.tonight[0];

  assert.equal(catalog.scheduled.length, 0);
  assert.equal(event?.id, 'event-walk-2026-08-09');
  assert.equal(event?.kind, 'jogging');
  assert.equal(event?.imageKey, 'jogging');
  assert.equal(event?.capacity, 5);
  assert.equal(event?.remaining, 2);
  assert.deepEqual(event?.operations, {
    serverTime: '2026-08-09T12:00:00+09:00',
    eventId: 'event-walk-2026-08-09',
    templateId: 'tonight-campus-walk',
    eventType: 'tonight',
    activityType: 'walk',
    status: 'open',
    title: 'Campus walk',
    summary: 'A guided evening walk.',
    imageUrl: null,
    startsAt: '2026-08-09T20:00:00+09:00',
    endsAt: '2026-08-09T21:30:00+09:00',
    checkInOpensAt: '2026-08-09T19:30:00+09:00',
    firstAssignmentAt: '2026-08-09T18:00:00+09:00',
    secondAssignmentAt: '2026-08-09T18:30:00+09:00',
    finalAssignmentAt: '2026-08-09T19:00:00+09:00',
    chatOpensAt: '2026-08-09T19:40:00+09:00',
    noShowReportOpensAt: '2026-08-09T20:10:00+09:00',
    timezone: 'Asia/Seoul',
    meetingPoint: {
      label: 'PNU gate',
      roadAddress: null,
      mapUrl: null,
    },
    endPoint: {
      label: 'PNU station',
      roadAddress: 'Busan Geumjeong-gu Jangjeon-ro 12',
      mapUrl: 'https://map.example.test/pnu-station',
    },
    routeSummary: 'Walk together from the gate to the station.',
    capacityTotal: 5,
    capacityByGender: { male: 3, female: 2 },
    minimumCapacityTotal: 3,
    minimumCapacityByGender: { male: 1, female: 1 },
    reducedCapacityRequiresConsent: true,
    remainingByGender: { male: 1, female: 1 },
    partyRules: {
      soloAllowed: true,
      friendsAllowed: true,
      maxPartySize: 3,
      sameGenderOnly: true,
      preserveFriendParty: true,
      fillOpenSeatsWithSameGenderSolo: true,
    },
    rules: ['Use Quantum chat for contact.'],
    contactRules: {
      externalContactRequestAllowed: false,
      afterContactChannel: 'quantum_chat',
    },
    deposit: {
      amountKrw: 10000,
      policyVersion: 'guided-event-deposit-v1',
    },
    participation: {
      participationId: 'participation-walk-1',
      eventId: 'event-walk-2026-08-09',
      partyType: 'solo',
      groupId: null,
      status: 'pending',
      eventAlias: null,
      createdAt: '2026-08-09T12:01:00+09:00',
      updatedAt: '2026-08-09T12:01:00+09:00',
    },
    remainingTotal: 2,
  });
});

test('V1 workout events retain their activity while using the available jogging artwork', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].event_id = 'event-workout-2026-08-10';
  payload.events[0].template_id = 'scheduled-campus-workout';
  payload.events[0].participation.event_id = 'event-workout-2026-08-10';
  payload.events[0].event_type = 'scheduled';
  payload.events[0].activity_type = 'workout';
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  const catalog = await client.listEvents();
  const event = catalog.scheduled[0];

  assert.equal(catalog.tonight.length, 0);
  assert.equal(event?.operations?.activityType, 'workout');
  assert.equal(event?.kind, 'jogging');
  assert.equal(event?.imageKey, 'jogging');
});

test('V1 accepts the contract 3:3 capacity', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].capacity_total = 6;
  payload.events[0].capacity_by_gender = { male: 3, female: 3 };
  payload.events[0].remaining_total = 3;
  payload.events[0].remaining_by_gender = { male: 1, female: 2 };
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  const catalog = await client.listEvents();
  assert.equal(catalog.tonight[0]?.capacity, 6);
  assert.deepEqual(catalog.tonight[0]?.operations?.capacityByGender, { male: 3, female: 3 });
});

test('V1 preserves shopping, exhibition, and outing activities with a safe existing image key', async () => {
  for (const activityType of ['shopping', 'exhibition', 'outing']) {
    const payload = structuredClone(guidedEventCatalogPayload);
    payload.events[0].activity_type = activityType;
    const client = createQuantumApiClient({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => null,
      fetchImpl: async () => Response.json(payload),
    });

    const catalog = await client.listEvents();
    assert.equal(catalog.tonight[0]?.operations?.activityType, activityType);
    assert.equal(catalog.tonight[0]?.imageKey, 'jogging');
  }
});

test('a V0-shaped catalog with an unknown contract version is rejected', async () => {
  const payload = { ...catalogPayload, contract_version: 'quantum-guided-event-v0' };
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 guided events reject an unknown activity type', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].activity_type = 'concert';
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 board-game events require the contract minimum of four participants', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].activity_type = 'board_game';
  payload.events[0].minimum_capacity_total = 3;
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 board-game events accept the contract minimum of four participants', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].activity_type = 'board_game';
  payload.events[0].minimum_capacity_total = 4;
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  const catalog = await client.listEvents();
  assert.equal(catalog.tonight[0]?.operations?.minimumCapacityTotal, 4);
});

test('V1 non-board-game events reject a minimum capacity of four participants', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].minimum_capacity_total = 4;
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 guided events reject missing required contract DTO fields', async () => {
  for (const field of [
    'timezone',
    'end_point',
    'route_summary',
    'remaining_by_gender',
    'party_rules',
    'rules',
    'deposit',
    'participation',
  ]) {
    const payload = structuredClone(guidedEventCatalogPayload) as Record<string, unknown>;
    const events = payload.events as Array<Record<string, unknown>>;
    delete events[0][field];
    const client = createQuantumApiClient({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => null,
      fetchImpl: async () => Response.json(payload),
    });

    await assert.rejects(
      () => client.listEvents(),
      (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
    );
  }
});

test('V1 guided events reject final assignment after chat opens', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].final_assignment_at = '2026-08-09T19:50:00+09:00';
  payload.events[0].chat_opens_at = '2026-08-09T19:40:00+09:00';
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 guided events reject schedule labels that drift from the locked T offsets', async () => {
  const fields = [
    'first_assignment_at',
    'second_assignment_at',
    'final_assignment_at',
    'chat_opens_at',
    'no_show_report_opens_at',
  ] as const;

  for (const field of fields) {
    const payload = structuredClone(guidedEventCatalogPayload);
    payload.events[0][field] = new Date(Date.parse(payload.events[0][field]) + 60_000).toISOString();
    const client = createQuantumApiClient({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => null,
      fetchImpl: async () => Response.json(payload),
    });

    await assert.rejects(
      () => client.listEvents(),
      (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
      `${field} must retain its exact locked offset`,
    );
  }
});

test('V1 scheduled events allow ordered assignment times outside the tonight T offsets', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].event_type = 'scheduled';
  payload.events[0].first_assignment_at = '2026-08-09T18:01:00+09:00';
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  const catalog = await client.listEvents();
  assert.equal(catalog.scheduled[0]?.operations?.firstAssignmentAt, payload.events[0].first_assignment_at);
});

test('V1 guided events reject no-show reporting at or after the event end', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].no_show_report_opens_at = payload.events[0].ends_at;
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 guided events reject an invalid capacity gender ratio', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].capacity_by_gender = { male: 2, female: 3 };
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 guided events reject external contact permission', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].contact_rules.external_contact_request_allowed = true;
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 guided events reject a changed post-event contact channel', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.events[0].contact_rules.after_contact_channel = 'external_messenger';
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('V1 guided events reject missing values for all eight scheduling fields', async () => {
  for (const field of [
    'starts_at',
    'ends_at',
    'check_in_opens_at',
    'first_assignment_at',
    'second_assignment_at',
    'final_assignment_at',
    'chat_opens_at',
    'no_show_report_opens_at',
  ]) {
    const payload = structuredClone(guidedEventCatalogPayload) as Record<string, unknown>;
    const events = payload.events as Array<Record<string, unknown>>;
    delete events[0][field];
    const client = createQuantumApiClient({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => null,
      fetchImpl: async () => Response.json(payload),
    });

    await assert.rejects(
      () => client.listEvents(),
      (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
    );
  }
});

test('V1 guided events reject offset-free values for all eight scheduling fields', async () => {
  for (const field of [
    'starts_at',
    'ends_at',
    'check_in_opens_at',
    'first_assignment_at',
    'second_assignment_at',
    'final_assignment_at',
    'chat_opens_at',
    'no_show_report_opens_at',
  ]) {
    const payload = structuredClone(guidedEventCatalogPayload) as Record<string, unknown>;
    const events = payload.events as Array<Record<string, unknown>>;
    events[0][field] = String(events[0][field]).replace(/[+-]\d{2}:\d{2}$/, '');
    const client = createQuantumApiClient({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => null,
      fetchImpl: async () => Response.json(payload),
    });

    await assert.rejects(
      () => client.listEvents(),
      (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
    );
  }
});

test('V1 guided events reject impossible calendar dates and non-ISO server time', async () => {
  for (const serverTime of ['2026-02-30T12:00:00+09:00', 'Sun, 09 Aug 2026 03:00:00 GMT']) {
    const payload = structuredClone(guidedEventCatalogPayload);
    payload.server_time = serverTime;
    const client = createQuantumApiClient({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => null,
      fetchImpl: async () => Response.json(payload),
    });

    await assert.rejects(
      () => client.listEvents(),
      (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
    );
  }
});

test('V1 guided events reject inconsistent participation chronology and alias state', async () => {
  const chronology = structuredClone(guidedEventCatalogPayload);
  chronology.events[0].participation.updated_at = '2026-08-09T11:59:00+09:00';

  const confirmedWithoutAlias = structuredClone(guidedEventCatalogPayload);
  confirmedWithoutAlias.events[0].participation.status = 'confirmed';
  confirmedWithoutAlias.events[0].participation.event_alias = null;

  const pendingWithAlias = structuredClone(guidedEventCatalogPayload);
  pendingWithAlias.events[0].participation.status = 'pending';
  pendingWithAlias.events[0].participation.event_alias = '새벽';

  for (const payload of [chronology, confirmedWithoutAlias, pendingWithAlias]) {
    const client = createQuantumApiClient({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => null,
      fetchImpl: async () => Response.json(payload),
    });
    await assert.rejects(
      () => client.listEvents(),
      (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
    );
  }
});

test('authenticated API client rejects cleartext remote origins but permits loopback development', () => {
  assert.throws(
    () => createQuantumApiClient({
      origin: 'http://api.example.test',
      getAccessToken: async () => 'secret-token',
      allowInsecureLoopbackHttp: false,
    }),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_api_origin',
  );

  assert.doesNotThrow(() => createQuantumApiClient({
    origin: 'http://127.0.0.1:3003',
    getAccessToken: async () => 'development-token',
    allowInsecureLoopbackHttp: true,
  }));
  assert.throws(
    () => createQuantumApiClient({
      origin: 'http://127.0.0.1:3003',
      getAccessToken: async () => 'production-token',
      allowInsecureLoopbackHttp: false,
    }),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_api_origin',
  );
});

test('V1 accepts ISO timestamps with server microsecond precision', async () => {
  const payload = structuredClone(guidedEventCatalogPayload);
  payload.server_time = '2026-08-09T12:00:00.123456+09:00';
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json(payload),
  });

  const catalog = await client.listEvents();
  assert.equal(catalog.tonight[0]?.operations?.serverTime, payload.server_time);
});

test('participation mutations require a session before calling the server', async () => {
  let callCount = 0;
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => {
      callCount += 1;
      return Response.json({});
    },
  });

  await assert.rejects(
    () => client.joinEvent('tonight-board-game', 'solo'),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'auth_required',
  );
  assert.equal(callCount, 0);
});

test('participation mutation sends the Supabase access token as Bearer auth', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-access-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json({
        participation: {
          event_id: 'tonight-board-game',
          event_mode: 'tonight',
          party_type: 'solo',
          updated_at: '2026-08-09T12:00:00.000Z',
        },
      });
    },
  });

  const participation = await client.joinEvent('tonight-board-game', 'solo');

  assert.equal(participation?.eventId, 'tonight-board-game');
  assert.equal(calls[0]?.url, 'https://dating-app-silk.vercel.app/api/match/event-participation');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer mobile-access-token');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    event_id: 'tonight-board-game',
    party_type: 'solo',
  });
});

test('invalid event responses are rejected instead of entering the UI', async () => {
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => Response.json({ availability: 'ready', events: { tonight: [{}], scheduled: [] } }),
  });

  await assert.rejects(
    () => client.listEvents(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
});

test('an unapplied participation schema is shown as unavailable instead of empty participation', async () => {
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-access-token',
    fetchImpl: async () => Response.json({
      participation: null,
      availability: 'schema_unavailable',
    }),
  });

  await assert.rejects(
    () => client.getParticipation(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'schema_unavailable',
  );
});
