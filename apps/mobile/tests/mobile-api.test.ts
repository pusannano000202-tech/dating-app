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
