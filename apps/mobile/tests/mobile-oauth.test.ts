import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOAuthCallbackUrl } from '../src/auth/oauth-callback';

test('OAuth callback accepts access and refresh tokens from a mobile deep link', () => {
  assert.deepEqual(
    parseOAuthCallbackUrl('quantum://auth/callback#access_token=access.jwt&refresh_token=refresh.jwt'),
    { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' },
  );
});

test('OAuth callback rejects provider failures and incomplete sessions', () => {
  assert.throws(
    () => parseOAuthCallbackUrl('quantum://auth/callback?error_code=access_denied'),
    /access_denied/,
  );
  assert.throws(
    () => parseOAuthCallbackUrl('quantum://auth/callback#access_token=access.jwt'),
    /oauth_session_invalid/,
  );
});
