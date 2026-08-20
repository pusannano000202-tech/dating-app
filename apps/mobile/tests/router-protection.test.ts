import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const rootLayoutPath = new URL('../app/_layout.tsx', import.meta.url);
const myPreviewPath = new URL('../app/dev-my-preview.tsx', import.meta.url);

test('development My preview is registered only inside the development guard', async () => {
  const source = await readFile(rootLayoutPath, 'utf8');

  assert.match(source, /\{__DEV__ \? <Stack\.Screen name="dev-my-preview" \/> : null\}/);
});

test('My preview redirects outside development and stays local to production components', async () => {
  const source = await readFile(myPreviewPath, 'utf8');

  assert.match(source, /if \(!__DEV__\) return <Redirect href="\/login" \/>;/);
  assert.match(source, /MyProfileHeader/);
  assert.match(source, /MyPeopleSection/);
  assert.match(source, /MyProfileSection/);
  assert.match(source, /MyFinanceSafetySection/);
  assert.match(source, /useLocalSearchParams/);
  assert.match(source, /profileState=\{previewState\}/);
  assert.match(source, /state=\{previewState\}/);
  assert.match(source, /photoState=\{previewState\}/);
  assert.match(source, /style=\{styles\.sections\}/);
  assert.match(source, /sections: \{ gap: spacing\.xl/);
  assert.match(source, /testID="my-preview-last-action"/);
  assert.match(source, /setLastAction/);
  assert.match(source, /primaryPhotoUrl=\{null\}/);
  assert.doesNotMatch(source, /getQuantumApiClient|getProfilePhotosApi|getSocialApiClient|useAuth/);
  assert.match(source, /const previewFriends = \[/);
  assert.match(source, /friends=\{isReady \? previewFriends : \[\]\}/);
  assert.match(source, /displayName: '.*'/);
});
