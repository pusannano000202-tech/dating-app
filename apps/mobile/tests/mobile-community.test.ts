import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const communityScreenPath = new URL('../app/(tabs)/community.tsx', import.meta.url);
const communityPreviewPath = new URL('../app/community/dev-preview.tsx', import.meta.url);

test('Campus Eats is the first and primary one-tap community action', async () => {
  const source = await readFile(communityScreenPath, 'utf8');

  assert.match(source, /부산대 돈까스 월드컵/);
  assert.match(source, /\/community\/campus-eats\?mode=battle&category=donkatsu/);
  assert.match(source, /\/campus-eats\/preview\/cutlet-katsu\.webp/);
  assert.doesNotMatch(source, /assets\/events\/dinner\.webp/);
  assert.match(source, /WebBrowser\.openBrowserAsync/);
  assert.match(source, /onPress=\{\(\) => void openWebDestination\(featuredDestination\)\}/);
  assert.ok(
    source.indexOf("id: 'campus-eats'") < source.indexOf("id: 'feedback'"),
    'Campus Eats must be declared before the board destinations',
  );
});

test('existing web community boards have real one-tap destinations', async () => {
  const source = await readFile(communityScreenPath, 'utf8');

  assert.match(source, /\/community\/feedback/);
  assert.match(source, /\/community\/meetup-review/);
  assert.match(source, /\/community\/relationship-advice/);
  assert.match(source, /onPress=\{\(\) => void openWebDestination\(item\)\}/);
  assert.match(source, /readMobileConfig\(process\.env\)\.apiOrigin/);
  assert.doesNotMatch(source, /https:\/\/dating-app-silk\.vercel\.app/);
});

test('native-only community work is separated as pending without fake success or feed data', async () => {
  const source = await readFile(communityScreenPath, 'utf8');

  assert.match(source, /모바일 안에서 글쓰기/);
  assert.match(source, /준비 중/);
  assert.match(source, /웹 화면을 열지 못했어요/);
  assert.doesNotMatch(source, /서버 연결 전 예시/);
  assert.doesNotMatch(source, /가상|샘플 게시글|fake|mock/i);
});

test('community visual preview is development-only and fails closed in production', async () => {
  const screenSource = await readFile(communityScreenPath, 'utf8');
  assert.equal(existsSync(communityPreviewPath), true, 'development preview route must exist');
  const previewSource = await readFile(communityPreviewPath, 'utf8');

  assert.match(screenSource, /export function CommunityScreen/);
  assert.match(previewSource, /if \(!__DEV__\) return <Redirect href="\/login" \/>/);
  assert.match(previewSource, /<CommunityScreen \/>/);
});
