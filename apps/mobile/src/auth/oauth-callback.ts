export type OAuthSessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export function parseOAuthCallbackUrl(callbackUrl: string): OAuthSessionTokens {
  const url = new URL(callbackUrl);
  const query = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const errorCode = query.get('error_code') ?? fragment.get('error_code') ?? query.get('error');

  if (errorCode) throw new Error(errorCode);

  const accessToken = fragment.get('access_token') ?? query.get('access_token');
  const refreshToken = fragment.get('refresh_token') ?? query.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('oauth_session_invalid');

  return { accessToken, refreshToken };
}
