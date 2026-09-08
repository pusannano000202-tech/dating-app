import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

type UploadPhoto = {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png' | 'image/webp';
};

type RecordedFormData = {
  append(name: string, value: unknown): void;
  entries: Array<{ name: string; value: unknown }>;
};

type ProfilePhotosModule = {
  ProfilePhotosApiError: new (code: string, status?: number) => Error & { code: string; status?: number };
  createProfilePhotosApi(options: {
    origin: string;
    getAccessToken: () => Promise<string | null>;
    fetchImpl?: typeof fetch;
    formDataFactory?: () => RecordedFormData;
  }): {
    listPhotos(): Promise<{
      photos: string[];
      items: Array<{ storagePath: string; sortOrder: number; signedUrl: string }>;
    }>;
    replacePhotos(photos: UploadPhoto[]): Promise<{
      photos: string[];
      items: Array<{ storagePath: string; sortOrder: number; signedUrl: string }>;
    }>;
    deletePhoto(storagePath: string): Promise<void>;
  };
};

const apiModuleUrl = new URL('../src/api/profile-photos.ts', import.meta.url);
const screenUrl = new URL('../app/profile/photos.tsx', import.meta.url);
const layoutUrl = new URL('../app/_layout.tsx', import.meta.url);

async function loadApiModule(): Promise<ProfilePhotosModule> {
  const loaded = await import(apiModuleUrl.href).catch(() => null);
  assert.ok(loaded, 'profile photo API module must exist');
  return loaded as ProfilePhotosModule;
}

function createRecordedFormData(): RecordedFormData {
  const entries: RecordedFormData['entries'] = [];
  return {
    entries,
    append(name, value) {
      entries.push({ name, value });
    },
  };
}

const photoPayload = {
  photos: ['https://signed.example/photo-0'],
  items: [{
    storage_path: 'user-id/photo-0.jpg',
    sort_order: 0,
    signed_url: 'https://signed.example/photo-0',
  }],
};

test('profile photos GET uses Bearer auth and parses private signed items', async () => {
  const { createProfilePhotosApi } = await loadApiModule();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createProfilePhotosApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-photo-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(photoPayload);
    },
  });

  const result = await api.listPhotos();

  assert.equal(calls[0]?.url, 'https://dating-app-silk.vercel.app/api/profile/photos');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer mobile-photo-token');
  assert.deepEqual(result.items, [{
    storagePath: 'user-id/photo-0.jpg',
    sortOrder: 0,
    signedUrl: 'https://signed.example/photo-0',
  }]);
});

test('photo replacement sends 1 to 3 native files as repeated multipart photos fields', async () => {
  const { createProfilePhotosApi } = await loadApiModule();
  const formData = createRecordedFormData();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createProfilePhotosApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-photo-token',
    formDataFactory: () => formData,
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(photoPayload);
    },
  });
  const photos: UploadPhoto[] = [
    { uri: 'file:///one.jpg', name: 'one.jpg', type: 'image/jpeg' },
    { uri: 'file:///two.webp', name: 'two.webp', type: 'image/webp' },
  ];

  await api.replacePhotos(photos);

  assert.equal(calls[0]?.init?.method, 'PUT');
  assert.equal(new Headers(calls[0]?.init?.headers).has('Content-Type'), false);
  assert.deepEqual(formData.entries.map((entry) => entry.name), ['photos', 'photos']);
  assert.deepEqual(formData.entries.map((entry) => entry.value), photos);
});

test('photo replacement rejects counts outside 1 to 3 without a network request', async () => {
  const { createProfilePhotosApi, ProfilePhotosApiError } = await loadApiModule();
  let calls = 0;
  const api = createProfilePhotosApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-photo-token',
    fetchImpl: async () => {
      calls += 1;
      return Response.json(photoPayload);
    },
  });

  await assert.rejects(
    () => api.replacePhotos([]),
    (error: unknown) => error instanceof ProfilePhotosApiError && error.code === 'photo_count_invalid',
  );
  await assert.rejects(
    () => api.replacePhotos([
      { uri: 'file:///1.jpg', name: '1.jpg', type: 'image/jpeg' },
      { uri: 'file:///2.jpg', name: '2.jpg', type: 'image/jpeg' },
      { uri: 'file:///3.jpg', name: '3.jpg', type: 'image/jpeg' },
      { uri: 'file:///4.jpg', name: '4.jpg', type: 'image/jpeg' },
    ]),
    (error: unknown) => error instanceof ProfilePhotosApiError && error.code === 'photo_count_invalid',
  );
  assert.equal(calls, 0);
});

test('individual photo DELETE sends storage_path with Bearer auth', async () => {
  const { createProfilePhotosApi } = await loadApiModule();
  const calls: RequestInit[] = [];
  const api = createProfilePhotosApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-photo-token',
    fetchImpl: async (_input, init) => {
      calls.push(init ?? {});
      return Response.json({ ok: true });
    },
  });

  await api.deletePhoto('user-id/photo-0.jpg');

  assert.equal(calls[0]?.method, 'DELETE');
  assert.equal(new Headers(calls[0]?.headers).get('Authorization'), 'Bearer mobile-photo-token');
  assert.deepEqual(JSON.parse(String(calls[0]?.body)), { storage_path: 'user-id/photo-0.jpg' });
});

test('profile photo API fails closed without a session or with malformed photo data', async () => {
  const { createProfilePhotosApi, ProfilePhotosApiError } = await loadApiModule();
  let calls = 0;
  const signedOutApi = createProfilePhotosApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => {
      calls += 1;
      return Response.json(photoPayload);
    },
  });
  await assert.rejects(
    () => signedOutApi.listPhotos(),
    (error: unknown) => error instanceof ProfilePhotosApiError && error.code === 'auth_required',
  );
  assert.equal(calls, 0);

  const malformedApi = createProfilePhotosApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-photo-token',
    fetchImpl: async () => Response.json({ photos: [], items: [{ storage_path: '', sort_order: 4 }] }),
  });
  await assert.rejects(
    () => malformedApi.listPhotos(),
    (error: unknown) => error instanceof ProfilePhotosApiError && error.code === 'invalid_response',
  );
});

test('native photo screen selects up to 3 images, previews them, replaces all, deletes existing, then opens match', async () => {
  const [screenSource, layoutSource] = await Promise.all([
    readFile(screenUrl, 'utf8').catch(() => ''),
    readFile(layoutUrl, 'utf8'),
  ]);
  const protectedBlock = layoutSource.match(/<Stack\.Protected guard=\{Boolean\(session\)\}>([\s\S]*?)<\/Stack\.Protected>/)?.[1] ?? '';

  assert.match(screenSource, /launchImageLibraryAsync/);
  assert.match(screenSource, /allowsMultipleSelection:\s*true/);
  assert.match(screenSource, /selectionLimit:\s*MAX_PHOTOS/);
  assert.match(screenSource, /<Image/);
  assert.match(screenSource, /\.listPhotos\(\)/);
  assert.match(screenSource, /\.replacePhotos\(selectedPhotos\)/);
  assert.match(screenSource, /\.deletePhoto\(storagePath\)/);
  assert.match(screenSource, /router\.replace\('\/match'\)/);
  assert.match(protectedBlock, /<Stack\.Screen name="profile\/photos" \/>/);
});

test('photo selection and storage code never calls appearance analysis', async () => {
  const [apiSource, screenSource] = await Promise.all([
    readFile(apiModuleUrl, 'utf8').catch(() => ''),
    readFile(screenUrl, 'utf8').catch(() => ''),
  ]);
  const photoSource = `${apiSource}\n${screenSource}`;

  assert.doesNotMatch(photoSource, /\/api\/score|score-photos|appearance[_-]score/i);
  assert.match(photoSource, /\/api\/profile\/photos/);
});
