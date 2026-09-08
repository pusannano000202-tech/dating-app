import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createMeetingAlbumApi } from '../src/api/meeting-album';

test('mobile album reads private signed photos with bearer authentication', async () => {
  const requests: Array<{ input: string; authorization: string | null }> = [];
  const api = createMeetingAlbumApi({
    origin: 'https://quantum.example',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      requests.push({
        input: String(input),
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      return Response.json({
        operations: {
          starts_at: '2026-08-11T10:00:00.000Z',
          ends_at: '2026-08-11T12:00:00.000Z',
          evidence_upload_opens_at: '2026-08-11T09:40:00.000Z',
          evidence_upload_closes_at: '2026-08-12T12:00:00.000Z',
          phase: 'complete',
          can_upload_evidence: true,
        },
        photos: [{
          id: 'photo-1',
          signed_url: 'https://signed.example/photo.jpg',
          submitted_at: '2026-08-11T12:10:00.000Z',
          captured_at: null,
          status: 'submitted',
          mine: true,
          expires_in: 300,
        }],
      });
    },
  });

  const album = await api.getAlbum('match-1');
  assert.equal(album.photos[0].signedUrl, 'https://signed.example/photo.jpg');
  assert.deepEqual(requests, [{
    input: 'https://quantum.example/api/matches/match-1/album',
    authorization: 'Bearer mobile-token',
  }]);
});

test('mobile album uploads one photo without forcing a JSON content type', async () => {
  const appended: Array<[string, unknown]> = [];
  const api = createMeetingAlbumApi({
    origin: 'https://quantum.example',
    getAccessToken: async () => 'mobile-token',
    formDataFactory: () => ({ append: (name, value) => appended.push([name, value]) }),
    fetchImpl: async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Content-Type'), null);
      assert.equal(init?.method, 'POST');
      return Response.json({
        evidence: { id: 'photo-1', submitted_at: '2026-08-11T12:10:00.000Z', status: 'submitted' },
        reused_existing: false,
        operations: {
          starts_at: '2026-08-11T10:00:00.000Z',
          ends_at: '2026-08-11T12:00:00.000Z',
          evidence_upload_opens_at: '2026-08-11T09:40:00.000Z',
          evidence_upload_closes_at: '2026-08-12T12:00:00.000Z',
          phase: 'complete',
          can_upload_evidence: true,
        },
      }, { status: 201 });
    },
  });

  await api.uploadEvidence('match-1', { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  assert.equal(appended[0][0], 'photo');
});

test('mobile album client lists the users actual matches before opening an album', async () => {
  const requests: string[] = [];
  const api = createMeetingAlbumApi({
    origin: 'https://quantum.example',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input) => {
      requests.push(String(input));
      return Response.json({
        matches: [{
          match_id: 'match-1',
          match_status: 'completed',
          scheduled_start: '2026-08-11T10:00:00.000Z',
          venue_name: '부산대 정문',
        }],
      });
    },
  });

  const matches = await api.listMatches();
  assert.equal(matches[0].matchId, 'match-1');
  assert.deepEqual(requests, ['https://quantum.example/api/matches']);
});

test('mobile meeting album screen explains the single-upload album contract', () => {
  const screen = fs.readFileSync(
    path.join(__dirname, '../app/matches/[matchId]/album.tsx'),
    'utf8',
  );
  assert.match(screen, /expo-image-picker/);
  assert.match(screen, /참가 확인과 참가자 앨범에 함께 저장/);
  assert.match(screen, /사진 한 장만으로 보증금 제재를 결정하지 않아요/);
  assert.match(screen, /uploadEvidence/);
});

test('mobile profile links the latest actual match to its participant album', () => {
  const profile = fs.readFileSync(
    path.join(__dirname, '../app/(tabs)/profile.tsx'),
    'utf8',
  );
  const route = fs.readFileSync(path.join(__dirname, '../../../app/api/matches/route.ts'), 'utf8');
  assert.match(profile, /listMatches\(\)/);
  assert.match(profile, /\/matches\/\$\{latestMatch\.matchId\}\/album/);
  assert.match(route, /createSupabaseRequestClient\(request\)/);
});
