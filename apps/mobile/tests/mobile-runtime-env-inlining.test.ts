import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const mobileRoot = join(process.cwd());

test('Expo public runtime values use statically inlineable process.env access', () => {
  const source = readFileSync(join(mobileRoot, 'src/config/runtime.ts'), 'utf8');

  assert.match(source, /process\.env\.EXPO_PUBLIC_API_ORIGIN/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});

test('runtime callers do not pass the dynamic process.env object', () => {
  const callers = [
    'src/api/social.ts',
    'src/api/quantum.ts',
    'src/api/departments.ts',
    'src/api/meeting-album.ts',
    'src/api/deposit.ts',
    'src/api/profile-photos.ts',
    'src/api/meetups.ts',
    'src/lib/supabase.ts',
  ];

  for (const relativePath of callers) {
    const source = readFileSync(join(mobileRoot, relativePath), 'utf8');
    assert.doesNotMatch(source, /readMobileConfig\(process\.env\)/, relativePath);
  }
});
