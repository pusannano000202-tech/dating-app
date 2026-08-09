import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { createQuantumApiClient, QuantumApiError } from '../src/api/client';

const readyProfilePayload = {
  availability: 'ready',
  profile: {
    display_name: '새벽',
    gender: 'female',
    age: 22,
    height: 165,
    body_type: 'average',
    hair_density: null,
    school: '부산대학교',
    department: '디자인학과',
    year: 3,
  },
  photo_count: 2,
  appearance_status: 'not_requested',
  next_step: 'complete',
  is_complete: true,
};

test('mobile profile summary uses Bearer authentication and accepts a completed profile', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(readyProfilePayload);
    },
  });

  const summary = await client.getProfileOnboarding();

  assert.equal(calls[0]?.url, 'https://dating-app-silk.vercel.app/api/profile/onboarding');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer mobile-token');
  assert.equal(summary.isComplete, true);
  assert.equal(summary.nextStep, 'complete');
  assert.equal(summary.profile?.displayName, '새벽');
})

test('mobile profile summary rejects contradictory completion state', async () => {
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async () => Response.json({ ...readyProfilePayload, is_complete: false }),
  });

  await assert.rejects(
    () => client.getProfileOnboarding(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
})

test('appearance analysis is requested only through the explicit match-search trigger', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json({
        status: 'ok',
        self_appearance_score_persisted: true,
        reused_existing_score: true,
      });
    },
  });

  const result = await client.prepareAppearanceScoreForMatch();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://dating-app-silk.vercel.app/api/score');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer mobile-token');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { trigger: 'match_search' });
  assert.deepEqual(result, { reusedExistingScore: true });
})

test('appearance analysis rejects responses that expose or omit the safe persisted contract', async () => {
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async () => Response.json({ status: 'ok', score: 72 }),
  });

  await assert.rejects(
    () => client.prepareAppearanceScoreForMatch(),
    (error: unknown) => error instanceof QuantumApiError && error.code === 'invalid_response',
  );
})

test('my hub composes the approved sections and routes its profile actions', async () => {
  const profileSource = await readFile(new URL('../app/(tabs)/profile.tsx', import.meta.url), 'utf8');

  assert.match(profileSource, /import \{ MyProfileHeader \} from ['"]\.\.\/\.\.\/src\/components\/my\/MyProfileHeader['"];/);
  assert.match(profileSource, /import \{ MyPeopleSection \} from ['"]\.\.\/\.\.\/src\/components\/my\/MyPeopleSection['"];/);
  assert.match(profileSource, /import \{ MyProfileSection \} from ['"]\.\.\/\.\.\/src\/components\/my\/MyProfileSection['"];/);
  assert.match(profileSource, /import \{ MyFinanceSafetySection \} from ['"]\.\.\/\.\.\/src\/components\/my\/MyFinanceSafetySection['"];/);
  assert.match(profileSource, /<MyProfileHeader/);
  assert.match(profileSource, /<MyPeopleSection/);
  assert.match(profileSource, /<MyProfileSection/);
  assert.match(profileSource, /<MyFinanceSafetySection/);
  assert.match(profileSource, /selectActiveFriends/);
  assert.match(profileSource, /selectActiveFriends\(friendsState\.data\?\.friends \?\? \[\]\)/);
  assert.match(profileSource, /notificationsState=\{notificationsState\.status\}/);
  assert.match(profileSource, /photoState=\{photosState\.status\}/);
  assert.match(profileSource, /useFocusEffect\(useCallback\(\(\) =>/);
  assert.match(profileSource, /router\.push\('\/friends'\)/);
  assert.match(profileSource, /router\.push\('\/notifications'\)/);
  assert.match(profileSource, /router\.push\('\/profile\/basic'\)/);
  assert.match(profileSource, /router\.push\('\/profile\/photos'\)/);
  assert.match(profileSource, /router\.push\('\/profile\/worldcup'\)/);
  assert.match(profileSource, /router\.push\('\/deposit'\)/);
})

test('my hub independently loads account data and confirms sign out', async () => {
  const profileSource = await readFile(new URL('../app/(tabs)/profile.tsx', import.meta.url), 'utf8');

  assert.match(profileSource, /getQuantumApiClient\(\)\.getProfileOnboarding\(\)/);
  assert.match(profileSource, /getProfilePhotosApi\(\)\.listPhotos\(\)/);
  assert.match(profileSource, /getSocialApiClient\(\)\.then\(\(client\) => client\.listFriends\(\)\)/);
  assert.match(profileSource, /getSocialApiClient\(\)\.then\(\(client\) => client\.listNotifications\(\{ unreadOnly: true, limit: 200 \}\)\)/);
  assert.doesNotMatch(profileSource, /Promise\.all\(/);
  assert.match(profileSource, /requestIdRef/);
  assert.match(profileSource, /focusedRef/);
  assert.match(profileSource, /Alert\.alert\(\s*['"]로그아웃['"]/);
})

test('basic profile visual preview is development-only', async () => {
  const source = await readFile(new URL('../app/dev-profile-preview.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!__DEV__\) return <Redirect href="\/login" \/>/);
  assert.match(source, /<BasicProfileScreen preview \/>/);
})

test('basic profile onboarding asks one chat question at a time and uses wheels for bounded numbers', async () => {
  const source = await readFile(new URL('../app/profile/basic.tsx', import.meta.url), 'utf8');

  assert.match(source, /type BasicProfileStep =/);
  assert.match(source, /assistantBubble/);
  assert.match(source, /answerBubble/);
  assert.match(source, /<WheelPicker/);
  assert.match(source, /values=\{AGE_OPTIONS\}/);
  assert.match(source, /values=\{HEIGHT_OPTIONS\}/);
  assert.match(source, /Array\.from\(\{ length: 18 \}, \(_, index\) => index \+ 18\)/);
  assert.match(source, /ref=\{wheelRef\}/);
  assert.match(source, /wheelRef\.current\?\.scrollTo/);
  assert.doesNotMatch(source, /<View pointerEvents=/);
  assert.doesNotMatch(source, /<Field label="나이"/);
  assert.doesNotMatch(source, /<Field label="키 \(선택\)"/);
})

test('mobile survey uses the authenticated server contract and stores raw answers only', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      if (init?.method === 'PUT') return Response.json({ ok: true });
      return Response.json({
        version: 'big5-short-v1',
        scale: { min: 1, max: 5 },
        traits: [
          ['openness', '개방성'],
          ['conscientiousness', '성실성'],
          ['extraversion', '외향성'],
          ['agreeableness', '친화성'],
          ['neuroticism', '감수성'],
        ].map(([key, label]) => ({ key, label, questions: ['질문 1', '질문 2'] })),
      });
    },
  });

  const contract = await client.getProfileSurvey();
  assert.equal(contract.traits.length, 5);
  const answers = Object.fromEntries(contract.traits.map((trait) => [trait.key, [3, 4]]));
  await client.saveProfileSurvey(contract.version, answers as Parameters<typeof client.saveProfileSurvey>[1]);

  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[1]?.init?.headers).get('Authorization'), 'Bearer mobile-token');
  const body = JSON.parse(String(calls[1]?.init?.body));
  assert.deepEqual(Object.keys(body).sort(), ['answers', 'version']);
  assert.equal('scores' in body, false);
})

test('my hub omits the survey row while protected navigation still registers it', async () => {
  const profileSource = await readFile(new URL('../app/(tabs)/profile.tsx', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../app/_layout.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(profileSource, /title:\s*['"]성향 설문['"]/);
  assert.doesNotMatch(profileSource, /route:\s*['"]\/profile\/survey['"]/);
  assert.match(layoutSource, /<Stack\.Screen name="profile\/survey" \/>/);
  assert.match(layoutSource, /<Stack\.Screen name="profile\/photos" \/>/);
})

test('mobile worldcup receives only candidate ids and absolute image urls', async () => {
  const candidates = Array.from({ length: 64 }, (_, index) => ({
    id: `candidate-${index}`,
    image_url: `/appearance-ideal/female-64/${index}.jpg`,
  }));
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuantumApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      if (init?.method === 'PUT') return Response.json({ ok: true });
      return Response.json({ version: 'appearance-worldcup-mobile-v1', candidate_gender: 'female', candidates });
    },
  });

  const contract = await client.getProfileWorldcup();
  assert.equal(contract.candidates.length, 64);
  assert.equal(contract.candidates[0].imageUrl, 'https://dating-app-silk.vercel.app/appearance-ideal/female-64/0.jpg');
  await client.saveProfileWorldcup(contract.version, Array(63).fill(contract.candidates[0].id));
  const body = JSON.parse(String(calls[1]?.init?.body));
  assert.deepEqual(Object.keys(body).sort(), ['version', 'winner_ids']);
})
