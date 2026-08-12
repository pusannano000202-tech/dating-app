import { createQuantumApiClient } from './client';
import { readMobileConfig } from '../config/runtime';
import { getSupabaseClient } from '../lib/supabase';

let client: ReturnType<typeof createQuantumApiClient> | null = null;

export function getQuantumApiClient() {
  if (client) return client;

  const runtime = readMobileConfig();
  const supabase = getSupabaseClient();
  client = createQuantumApiClient({
    origin: runtime.apiOrigin,
    getAccessToken: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    },
  });
  return client;
}
