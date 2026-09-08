import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createSocialApiClient } from '../src/api/social';

test('social client uses Bearer auth for friend list and request decisions', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createSocialApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith('/api/friend-requests')) {
        return Response.json({ sent: [], received: [], friends: [], current_user_id: 'me' });
      }
      return Response.json({ result: true });
    },
  });

  const snapshot = await client.listFriends();
  await client.respondToFriendRequest('request-1', 'accept');
  await client.respondToFriendRequest('request-2', 'decline');

  assert.equal(snapshot.currentUserId, 'me');
  assert.deepEqual(calls.map((call) => call.url), [
    'https://dating-app-silk.vercel.app/api/friend-requests',
    'https://dating-app-silk.vercel.app/api/friend-requests/request-1/accept',
    'https://dating-app-silk.vercel.app/api/friend-requests/request-2/decline',
  ]);
  for (const call of calls) {
    assert.equal(new Headers(call.init?.headers).get('Authorization'), 'Bearer mobile-token');
  }
});

test('department discovery is explicit opt-in and suggestions create real friend requests', async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const client = createSocialApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(input), body });
      if (String(input).includes('department-sync')) {
        return Response.json({
          suggestions: [{ user_id: 'student-1', display_name: '새벽' }],
          total_count: 1,
          discovery_enabled: true,
        });
      }
      return Response.json({ request: { id: 'request-3' } }, { status: 201 });
    },
  });

  const result = await client.setDepartmentDiscovery(true, 24);
  await client.sendFriendRequest('student-1');

  assert.equal(result.discoveryEnabled, true);
  assert.equal(result.suggestions[0]?.displayName, '새벽');
  assert.deepEqual(calls[0]?.body, { enabled: true, limit: 24 });
  assert.deepEqual(calls[1]?.body, { receiver_user_id: 'student-1' });
});

test('group invite support is limited to token lookup and acceptance', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createSocialApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      if (init?.method === 'POST') return Response.json({ invite: { id: 'invite-1', group_id: 'group-1' } });
      return Response.json({ invite: { id: 'invite-1', group_id: 'group-1' }, authenticated: true });
    },
  });

  const preview = await client.getGroupInvite('invite-token');
  await client.acceptGroupInvite('invite-token');

  assert.equal(preview.groupId, 'group-1');
  assert.equal(calls[0]?.url, 'https://dating-app-silk.vercel.app/api/group-invites?token=invite-token');
  assert.equal(calls[1]?.url, 'https://dating-app-silk.vercel.app/api/group-invites/accept');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { token: 'invite-token' });
});

test('notification client lists real rows and marks one or all as read', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createSocialApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).includes('/api/notifications?')) {
        return Response.json({
          notifications: [{ id: 'notice-1', kind: 'friend_request_received', payload: {}, read_at: null, created_at: '2026-08-09T00:00:00.000Z' }],
        });
      }
      return Response.json({ ok: true, updated: 1 });
    },
  });

  const notices = await client.listNotifications({ unreadOnly: false, limit: 50 });
  await client.markNotificationRead('notice-1');
  await client.markAllNotificationsRead();

  assert.equal(notices[0]?.kind, 'friend_request_received');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { notification_id: 'notice-1' });
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { all: true });
});

test('friend date proposals are private bearer-authenticated cards with explicit responses', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const friendId = '11111111-1111-4111-8111-111111111111';
  const proposalId = '22222222-2222-4222-8222-222222222222';
  const client = createSocialApiClient({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      if (!init?.method || init.method === 'GET') {
        return Response.json({
          proposals: [{
            id: proposalId,
            proposer_user_id: friendId,
            recipient_user_id: '33333333-3333-4333-8333-333333333333',
            other_user_id: friendId,
            other_display_name: '새벽',
            kind: 'cafe',
            message: '수업 끝나고 갈래요?',
            status: 'pending',
            responded_at: null,
            created_at: '2026-08-09T12:00:00.000Z',
          }],
        });
      }
      if (String(input).endsWith('/respond')) return Response.json({ status: 'accepted' });
      return Response.json({ proposal_id: proposalId }, { status: 201 });
    },
  });

  const proposals = await client.listFriendDateProposals(friendId);
  await client.createFriendDateProposal(friendId, 'meal', '오늘 저녁 어때요?');
  await client.respondToFriendDateProposal(proposalId, true);

  assert.equal(proposals[0]?.otherDisplayName, '새벽');
  assert.equal(proposals[0]?.kind, 'cafe');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    recipient_user_id: friendId,
    kind: 'meal',
    message: '오늘 저녁 어때요?',
  });
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { accept: true });
  for (const call of calls) {
    assert.equal(new Headers(call.init?.headers).get('Authorization'), 'Bearer mobile-token');
  }
});

test('native social screens expose honest loading, empty, error, and contract-limited states', async () => {
  const friendsSource = await readFile(new URL('../app/friends.tsx', import.meta.url), 'utf8');
  const friendDateSource = await readFile(new URL('../app/friends/[id].tsx', import.meta.url), 'utf8');
  const notificationsSource = await readFile(new URL('../app/notifications.tsx', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../app/_layout.tsx', import.meta.url), 'utf8');

  assert.match(friendsSource, /친구 정보를 불러오는 중/);
  assert.match(friendsSource, /아직 연결된 친구가 없어요/);
  assert.match(friendsSource, /다시 시도/);
  assert.match(friendsSource, /같은 학과 추천 켜기/);
  assert.match(friendsSource, /초대 코드로 참여/);
  assert.match(friendsSource, /수락/);
  assert.match(friendsSource, /거절/);
  assert.match(friendsSource, /router\.push\(\{ pathname: '\/friends\/\[id\]'/);
  assert.doesNotMatch(friendsSource, /가짜|샘플 친구|mock friend/i);

  assert.match(friendDateSource, /밥 먹을래요\?/);
  assert.match(friendDateSource, /카페 갈래요\?/);
  assert.match(friendDateSource, /산책할래요\?/);
  assert.match(friendDateSource, /수락/);
  assert.match(friendDateSource, /거절/);
  assert.doesNotMatch(friendDateSource, /전송됐어요[\s\S]*setTimeout|mock/i);

  assert.match(notificationsSource, /알림을 불러오는 중/);
  assert.match(notificationsSource, /아직 받은 알림이 없어요/);
  assert.match(notificationsSource, /모두 읽음/);
  assert.match(notificationsSource, /다시 시도/);
  assert.doesNotMatch(notificationsSource, /가짜|샘플 알림|mock notification/i);

  assert.match(layoutSource, /<Stack\.Screen name="friends" \/>/);
  assert.match(layoutSource, /<Stack\.Screen name="friends\/\[id\]" \/>/);
  assert.match(layoutSource, /<Stack\.Screen name="notifications" \/>/);
});

test('friend date visual preview is development-only and reuses the real screen', async () => {
  const source = await readFile(new URL('../app/dev-friend-date-preview.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!__DEV__\) return <Redirect href="\/login" \/>/);
  assert.match(source, /<FriendDateScreen/);
  assert.match(source, /preview/);
});
