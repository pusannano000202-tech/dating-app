import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { TonightEvent } from '../src/domain/events';

const recommendationsPath = new URL('../src/domain/home-recommendations.ts', import.meta.url);
const homeScreenPath = new URL('../app/(tabs)/index.tsx', import.meta.url);

test('home falls back to Campus Eats and keeps every choice on a real mobile route', async () => {
  assert.equal(existsSync(recommendationsPath), true, 'home recommendation domain must exist');

  const { buildHomeRecommendationWave } = await import('../src/domain/home-recommendations');
  const wave = buildHomeRecommendationWave(null);

  assert.equal(wave.primary.id, 'campus-eats');
  assert.equal(wave.primary.href, '/community');
  assert.deepEqual(
    wave.secondary.map((item) => item.id),
    ['tonight', 'meetup', 'feedback'],
  );
  assert.ok(
    [wave.primary, ...wave.secondary].every((item) => (
      item.href === '/match' || item.href === '/meetups' || item.href === '/community'
    )),
  );
});

test('home promotes an available tonight event from the safe server catalog', async () => {
  const { buildHomeRecommendationWave } = await import('../src/domain/home-recommendations');
  const tonightEvent: TonightEvent = {
    id: 'tonight-dinner',
    kind: 'dinner',
    scheduleType: 'tonight',
    eyebrow: '오늘 밤',
    title: '저녁 먹고 산책하기',
    description: '부산대 앞에서 가볍게 만나요.',
    venue: '부산대 정문',
    meetingTime: '오늘 20:00',
    capacity: 5,
    remaining: 2,
    imageKey: 'dinner',
    operations: null,
  };

  const wave = buildHomeRecommendationWave({ tonight: [tonightEvent], scheduled: [] });

  assert.equal(wave.primary.id, 'tonight');
  assert.equal(wave.primary.href, '/match');
  assert.equal(wave.primary.title, tonightEvent.title);
  assert.deepEqual(
    wave.secondary.map((item) => item.id),
    ['meetup', 'campus-eats', 'feedback'],
  );
});

test('home only promotes guided events that are still open and have room', async () => {
  const { buildHomeRecommendationWave } = await import('../src/domain/home-recommendations');
  const makeGuidedEvent = (
    id: string,
    title: string,
    status: 'open' | 'closed',
    remaining: number,
  ): TonightEvent => ({
    id,
    kind: 'dinner',
    scheduleType: 'tonight',
    eyebrow: status,
    title,
    description: '오늘 밤 활동',
    venue: '부산대 정문',
    meetingTime: '2026-08-09T20:00:00+09:00',
    capacity: 5,
    remaining,
    imageKey: 'dinner',
    operations: {
      status,
      serverTime: '2026-08-09T18:00:00+09:00',
      startsAt: '2026-08-09T20:00:00+09:00',
    } as NonNullable<TonightEvent['operations']>,
  });

  const closedOnly = buildHomeRecommendationWave({
    tonight: [makeGuidedEvent('closed', '마감된 저녁', 'closed', 2)],
    scheduled: [],
  });
  const withOpenEvent = buildHomeRecommendationWave({
    tonight: [
      makeGuidedEvent('closed', '마감된 저녁', 'closed', 2),
      makeGuidedEvent('open', '지금 참여할 저녁', 'open', 1),
    ],
    scheduled: [],
  });

  assert.equal(closedOnly.primary.id, 'campus-eats');
  assert.equal(withOpenEvent.primary.title, '지금 참여할 저녁');
});

test('home loads the catalog safely and renders one primary action with quiet next choices', async () => {
  const source = await readFile(homeScreenPath, 'utf8');

  assert.match(source, /getQuantumApiClient\(\)\.listEvents\(\)/);
  assert.match(source, /buildHomeRecommendationWave\(catalog\)/);
  assert.match(source, /buildHomeRecommendationWave\(null\)/);
  assert.match(source, /router\.push\(wave\.primary\.href\)/);
  assert.match(source, /wave\.secondary\.map/);
  assert.match(source, /router\.push\(item\.href\)/);
  assert.doesNotMatch(source, /오늘 밤 3개 활동이 열렸어요/);
  assert.doesNotMatch(source, /ImageBackground|LinearGradient/);
  assert.equal(source.match(/styles\.primaryButton(?=[,\]])/g)?.length, 1);
  assert.match(
    source,
    /topbar:\s*\{[\s\S]*?maxWidth:\s*layout\.maxContentWidth[\s\S]*?alignSelf:\s*'center'/,
  );
});
