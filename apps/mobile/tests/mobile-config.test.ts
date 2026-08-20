import assert from 'node:assert/strict';
import test from 'node:test';

import { readMobileConfig } from '../src/config/runtime';

test('mobile runtime config normalizes the API origin and keeps public Supabase values', () => {
  assert.deepEqual(
    readMobileConfig({
      EXPO_PUBLIC_API_ORIGIN: 'https://dating-app-silk.vercel.app/',
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    }),
    {
      apiOrigin: 'https://dating-app-silk.vercel.app',
      supabaseUrl: 'https://project.supabase.co',
      supabasePublishableKey: 'sb_publishable_example',
    },
  );
});

test('mobile runtime config rejects missing or non-http API origins', () => {
  assert.throws(
    () => readMobileConfig({
      EXPO_PUBLIC_API_ORIGIN: '',
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    }),
    /EXPO_PUBLIC_API_ORIGIN/,
  );
  assert.throws(
    () => readMobileConfig({
      EXPO_PUBLIC_API_ORIGIN: 'quantum://api',
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    }),
    /http/,
  );
});
