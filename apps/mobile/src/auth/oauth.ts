import type { Provider, Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { parseOAuthCallbackUrl } from './oauth-callback';
import { getSupabaseClient } from '../lib/supabase';

export type QuantumOAuthProvider = Extract<Provider, 'google' | 'kakao'>;

WebBrowser.maybeCompleteAuthSession();

export async function signInWithQuantumOAuth(provider: QuantumOAuthProvider): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const redirectTo = makeRedirectUri({ scheme: 'quantum', path: 'auth/callback' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('oauth_url_missing');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null;

  const tokens = parseOAuthCallbackUrl(result.url);
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (sessionError) throw sessionError;
  return sessionData.session;
}
