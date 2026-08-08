export type MobileRuntimeEnvironment = Record<string, string | undefined>;

export type MobileRuntimeConfig = {
  apiOrigin: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function readMobileConfig(environment: MobileRuntimeEnvironment): MobileRuntimeConfig {
  const apiOrigin = requireHttpUrl(environment.EXPO_PUBLIC_API_ORIGIN, 'EXPO_PUBLIC_API_ORIGIN');
  const supabaseUrl = requireHttpUrl(environment.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL');
  const supabasePublishableKey = requireValue(
    environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );

  return {
    apiOrigin: apiOrigin.replace(/\/+$/, ''),
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    supabasePublishableKey,
  };
}

function requireHttpUrl(value: string | undefined, name: string): string {
  const normalized = requireValue(value, name);
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error(`${name} must use http or https.`);
  }
  return normalized;
}

function requireValue(value: string | undefined, name: string): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
