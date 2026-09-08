import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MEETUP_CATEGORIES,
  MeetupApiError,
  createMeetupsApiClient,
  toMeetupScheduleIso,
} from '../src/api/meetups';

const meetup = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'running',
  title: '온천천 저녁 러닝',
  description: '속도보다 함께 완주해요.',
  place_name: '장전역 1번 출구',
  scheduled_at: '2026-08-10T10:00:00.000Z',
  capacity: 5,
  status: 'open',
  member_count: 2,
  joined: false,
  is_host: false,
  created_at: '2026-08-09T02:00:00.000Z',
};

test('meetup list sends the mobile bearer token and parses only real API rows', async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const client = createMeetupsApiClient({
    origin: 'https://quantum.example',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      request = { url: String(input), init };
      return Response.json({ meetups: [meetup], availability: 'ready' });
    },
  });

  const result = await client.list('running');

  assert.equal(request?.url, 'https://quantum.example/api/meetups?category=running');
  assert.equal(new Headers(request?.init?.headers).get('authorization'), 'Bearer mobile-token');
  assert.equal(result.availability, 'ready');
  assert.deepEqual(result.meetups, [meetup]);
});

test('meetup list rejects malformed rows instead of rendering fake content', async () => {
  const client = createMeetupsApiClient({
    origin: 'https://quantum.example',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async () => Response.json({
      meetups: [{ ...meetup, title: '' }],
      availability: 'ready',
    }),
  });

  await assert.rejects(
    () => client.list(),
    (error: unknown) => error instanceof MeetupApiError && error.code === 'invalid_response',
  );
});

test('meetup create uses the existing snake-case API contract', async () => {
  let body: unknown = null;
  const client = createMeetupsApiClient({
    origin: 'https://quantum.example/',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ meetup }, { status: 201 });
    },
  });

  const created = await client.create({
    category: 'running',
    title: meetup.title,
    description: meetup.description,
    placeName: meetup.place_name,
    scheduledAt: meetup.scheduled_at,
    capacity: meetup.capacity,
  });

  assert.deepEqual(body, {
    category: 'running',
    title: meetup.title,
    description: meetup.description,
    place_name: meetup.place_name,
    scheduled_at: meetup.scheduled_at,
    capacity: meetup.capacity,
  });
  assert.deepEqual(created, meetup);
});

test('meetup join and leave call the membership endpoint without fake local success', async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const client = createMeetupsApiClient({
    origin: 'https://quantum.example',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), method: init?.method });
      return Response.json({ membership: { joined: init?.method === 'POST', reused: false } });
    },
  });

  assert.equal((await client.join(meetup.id)).joined, true);
  assert.equal((await client.leave(meetup.id)).joined, false);
  assert.deepEqual(calls, [
    { url: `https://quantum.example/api/meetups/${meetup.id}/join`, method: 'POST' },
    { url: `https://quantum.example/api/meetups/${meetup.id}/join`, method: 'DELETE' },
  ]);
});

test('meetup API refuses unauthenticated mutations before sending a request', async () => {
  let called = false;
  const client = createMeetupsApiClient({
    origin: 'https://quantum.example',
    getAccessToken: async () => null,
    fetchImpl: async () => {
      called = true;
      return Response.json({});
    },
  });

  await assert.rejects(
    () => client.join(meetup.id),
    (error: unknown) => error instanceof MeetupApiError && error.code === 'auth_required',
  );
  assert.equal(called, false);
});

test('meetup schedule combines the local date and time into a valid future ISO value', () => {
  assert.equal(
    toMeetupScheduleIso('2026-08-10', '19:30', new Date('2026-08-09T00:00:00+09:00')),
    new Date(2026, 7, 10, 19, 30).toISOString(),
  );
  assert.throws(
    () => toMeetupScheduleIso('2026-08-09', '00:10', new Date('2026-08-09T00:00:00+09:00')),
    /schedule_too_soon/,
  );
});

test('mobile and web meetup contracts expose racket sports, gaming, and hiking', () => {
  for (const category of ['badminton', 'tennis', 'gaming', 'hiking']) {
    assert.equal((MEETUP_CATEGORIES as readonly string[]).includes(category), true);
  }

  const list = readFileSync(new URL('../app/(tabs)/meetups.tsx', import.meta.url), 'utf8');
  const create = readFileSync(new URL('../app/meetups/create.tsx', import.meta.url), 'utf8');
  for (const label of ['배드민턴', '테니스', '게임', '등산']) {
    assert.match(list, new RegExp(label));
    assert.match(create, new RegExp(label));
  }
});

test('mobile meetup filter list keeps the existing set of labels', () => {
  const list = readFileSync(new URL('../app/(tabs)/meetups.tsx', import.meta.url), 'utf8');
  for (const label of ['전체', '러닝', '농구', '배드민턴', '테니스', '축구', '야구', '보드게임', '게임', '등산', '산책', '맛집', '스터디', '기타']) {
    assert.match(list, new RegExp(label));
  }
});

test('mobile meetup screens expose real loading, empty, error, create and join states', () => {
  const list = readFileSync(new URL('../app/(tabs)/meetups.tsx', import.meta.url), 'utf8');
  const create = readFileSync(new URL('../app/meetups/create.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');

  assert.match(list, /getMeetupsApiClient\(\)\.list/);
  assert.match(list, /모임 만들기/);
  assert.match(list, /아직 열린 모임이 없어요/);
  assert.match(list, /다시 불러오기/);
  assert.match(list, /toggleMembership/);
  assert.doesNotMatch(list, /가짜 참여|미리보기 성공/);

  assert.match(create, /getMeetupsApiClient\(\)\.create/);
  assert.match(create, /toMeetupScheduleIso/);
  assert.match(create, /모임을 만들었어요/);
  assert.match(layout, /name="meetups\/create"/);
});
