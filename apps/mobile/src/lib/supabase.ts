import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { readMobileConfig } from '../config/runtime';

const secureStorage: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

let client: SupabaseClient | null = null;
let autoRefreshRegistered = false;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const config = readMobileConfig();
  client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      storage: Platform.OS === 'web' ? AsyncStorage : secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  registerAutoRefresh(client);
  return client;
}

function registerAutoRefresh(supabase: SupabaseClient) {
  if (autoRefreshRegistered || Platform.OS === 'web') return;
  autoRefreshRegistered = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
