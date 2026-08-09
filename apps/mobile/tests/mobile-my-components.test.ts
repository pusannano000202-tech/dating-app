import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readComponent(name: string) {
  return readFile(new URL(`../src/components/my/${name}.tsx`, import.meta.url), 'utf8').catch(() => '');
}

test('my profile header exposes the compact profile and retry contract', async () => {
  const source = await readComponent('MyProfileHeader');

  assert.match(source, /export type MyProfileHeaderProps = \{/);
  assert.match(source, /displayName: string;/);
  assert.match(source, /school: string \| null;/);
  assert.match(source, /primaryPhotoUrl: string \| null;/);
  assert.match(source, /progress: MyProfileProgress;/);
  assert.match(source, /actionLabel: string;/);
  assert.match(source, /onAction: \(\) => void;/);
  assert.match(source, /loading: boolean;/);
  assert.match(source, /error: boolean;/);
  assert.match(source, /마이/);
  assert.match(source, /내 정보와 만남을 한곳에서 관리해요\./);
  assert.match(source, /<Image/);
  assert.match(source, /resizeMode="cover"/);
  assert.match(source, /useEffect\(\(\) => \{\s*setImageFailed\(false\);\s*\}, \[primaryPhotoUrl\]\)/);
  assert.match(source, /primaryPhotoUrl && !imageFailed/);
  assert.match(source, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(source, /function initials\(displayName: string\)/);
  assert.match(source, /displayName\.trim\(\)\.slice\(0, 2\)/);
  assert.match(source, /<Text style=\{styles\.avatarInitial\}>\{initials\(displayName\)\}<\/Text>/);
  assert.match(source, /width: 72/);
  assert.match(source, /height: 72/);
  assert.match(source, /progress\.completed.*progress\.total.*완료/);
  assert.match(source, /width: `\$\{progress\.percent\}%`/);
  assert.match(source, /<ActivityIndicator/);
  assert.match(source, /accessibilityLabel=\{loading \? '프로필 불러오는 중'/);
  assert.match(source, /accessibilityState=\{\{ busy: loading, disabled: loading \}\}/);
  assert.match(source, /프로필을 불러오지 못했어요/);
  assert.match(source, /다시 확인/);
  assert.match(source, /minHeight: layout\.minimumTouchTarget/);
  assert.match(source, /radii\.card/);
  assert.match(source, /error: \{ color: colors\.body/);
  assert.doesNotMatch(source, /error: \{ color: colors\.action/);
  assert.doesNotMatch(source, /<UserRound/);
});

test('my people section keeps friend identities safe and counts truthful', async () => {
  const source = await readComponent('MyPeopleSection');

  assert.match(source, /export type MyPeopleSectionProps = \{/);
  assert.match(source, /state: 'loading' \| 'ready' \| 'error';/);
  assert.match(source, /friends: Array<\{ userId: string; displayName: string \| null \}>;/);
  assert.match(source, /receivedRequestCount: number \| null;/);
  assert.match(source, /unreadNotificationCount: number \| null;/);
  assert.match(source, /onFriends: \(\) => void;/);
  assert.match(source, /onNotifications: \(\) => void;/);
  assert.match(source, /사람/);
  assert.match(source, /slice\(0, 3\)/);
  assert.match(source, /initials/);
  assert.match(source, /아직 연결된 친구가 없어요\./);
  assert.match(source, /친구와 초대/);
  assert.match(source, /알림/);
  assert.match(source, /receivedRequestCount === null/);
  assert.match(source, /unreadNotificationCount === null/);
  assert.match(source, /친구 정보를 불러오는 중/);
  assert.match(source, /친구 정보를 확인하지 못했어요/);
  assert.match(source, /확인 필요/);
  assert.match(source, /receivedRequestCount > 0/);
  assert.match(source, /unreadNotificationCount > 0/);
  assert.match(source, /minHeight: layout\.minimumTouchTarget/);
  assert.match(source, /radii\.card/);
  assert.match(source, /badge: \{[^}]*backgroundColor: colors\.ink/);
  assert.doesNotMatch(source, /badge: \{[^}]*backgroundColor: colors\.action/);
  assert.doesNotMatch(source, /photoUrl|imageUrl|image_url/i);
  assert.doesNotMatch(source, /친구\s*\d+명|납부 완료|환불 완료/);
});

test('my profile section exposes only profile actions without a numeric appearance score', async () => {
  const source = await readComponent('MyProfileSection');

  assert.match(source, /export type MyProfileSectionProps = \{/);
  assert.match(source, /photoCount: number \| null;/);
  assert.match(source, /appearanceStatusLabel: string \| null;/);
  assert.match(source, /onBasic: \(\) => void;/);
  assert.match(source, /onPhotos: \(\) => void;/);
  assert.match(source, /onWorldcup: \(\) => void;/);
  assert.match(source, /내 프로필/);
  assert.match(source, /기본정보/);
  assert.match(source, /프로필 사진/);
  assert.match(source, /이상형 월드컵/);
  assert.match(source, /photoCount !== null/);
  assert.match(source, /appearanceStatusLabel/);
  assert.match(source, /minHeight: layout\.minimumTouchTarget/);
  assert.match(source, /radii\.card/);
  assert.doesNotMatch(source, /성향 설문/);
  assert.doesNotMatch(source, /appearanceScore|score:\s*number/i);
});

test('my finance and safety section keeps settlement state scoped to confirmed matches', async () => {
  const source = await readComponent('MyFinanceSafetySection');

  assert.match(source, /export type MyFinanceSafetySectionProps = \{/);
  assert.match(source, /onDeposit: \(\) => void;/);
  assert.match(source, /onSignOut: \(\) => void;/);
  assert.match(source, /signingOut: boolean;/);
  assert.match(source, /message: string \| null;/);
  assert.match(source, /결제와 안전/);
  assert.match(source, /보증금 10,000원/);
  assert.match(source, /확정 매칭에서 상태를 확인해요/);
  assert.match(source, /외모 점수와 내부 매칭 정보는 다른 사용자에게 공개하지 않아요\./);
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /<ActivityIndicator/);
  assert.match(source, /accessibilityLabel=\{signingOut \? '로그아웃 처리 중' : '로그아웃'\}/);
  assert.match(source, /accessibilityState=\{\{ busy: signingOut, disabled: signingOut \}\}/);
  assert.match(source, /minHeight: layout\.minimumTouchTarget/);
  assert.match(source, /radii\.card/);
  assert.match(source, /message: \{[^}]*color: colors\.body/);
  assert.doesNotMatch(source, /message: \{[^}]*color: colors\.action/);
  assert.doesNotMatch(source, /신고|차단|환불|이월|기부|납부 완료|환불 완료/);
});

test('my hub components use tokenized card radii without oversized literal radii', async () => {
  const sources = await Promise.all([
    readComponent('MyProfileHeader'),
    readComponent('MyPeopleSection'),
    readComponent('MyProfileSection'),
    readComponent('MyFinanceSafetySection'),
  ]);

  for (const source of sources) {
    assert.match(source, /radii\.card/);
    assert.doesNotMatch(source, /borderRadius:\s*(?:9|[1-9]\d+)/);
  }
});
