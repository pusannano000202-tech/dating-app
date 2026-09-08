import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const previewPath = new URL('../app/dev-guided-event-preview.tsx', import.meta.url);

test('guided-event visual preview is development-only and fails closed in production', async () => {
  const source = await readFile(previewPath, 'utf8');

  assert.match(source, /if \(!__DEV__\)/);
  assert.match(source, /<Redirect href="\/login" \/>/);
  assert.match(source, /EventOperationsSummary/);
  assert.match(source, /MeetingGuidePager/);
});
