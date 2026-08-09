import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const rootLayoutPath = new URL('../app/_layout.tsx', import.meta.url);
const myPreviewPath = new URL('../app/dev-my-preview.tsx', import.meta.url);

test('meeting guide is inside the authenticated mobile route group', async () => {
  const source = await readFile(rootLayoutPath, 'utf8');
  const protectedBlock = source.match(/<Stack\.Protected guard=\{Boolean\(session\)\}>([\s\S]*?)<\/Stack\.Protected>/)?.[1] ?? '';

  assert.match(protectedBlock, /<Stack\.Screen name="\(tabs\)" \/>/);
  assert.match(protectedBlock, /<Stack\.Screen name="meeting-guide" \/>/);
});

test('authenticated mobile checks onboarding without repeatedly redirecting completed users', async () => {
  const source = await readFile(rootLayoutPath, 'utf8');

  assert.match(source, /getProfileOnboarding\(\)/);
  assert.match(source, /summary\.nextStep === 'basic'/);
  assert.match(source, /router\.replace\('\/profile\/basic'\)/);
  assert.match(source, /summary\.isComplete/);
});

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
  assert.match(source, /profileState="ready"/);
  assert.match(source, /primaryPhotoUrl=\{null\}/);
  assert.doesNotMatch(source, /getQuantumApiClient|getProfilePhotosApi|getSocialApiClient|useAuth/);
  assert.match(source, /const previewFriends = \[/);
  assert.match(source, /friends=\{previewFriends\}/);
  assert.match(source, /displayName: '.*'/);
});
