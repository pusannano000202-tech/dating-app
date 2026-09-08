import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { signInWithQuantumOAuth, type QuantumOAuthProvider } from './oauth';
import { getSupabaseClient } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  configError: string | null;
  signIn: (provider: QuantumOAuthProvider) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;

    try {
      const supabase = getSupabaseClient();
      void supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) setConfigError('저장된 로그인 정보를 불러오지 못했어요.');
        setSession(data.session ?? null);
        setIsLoading(false);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (active) setSession(nextSession);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      setConfigError('모바일 API 연결 설정을 확인해 주세요.');
      setIsLoading(false);
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      configError,
      signIn: async (provider) => {
        const nextSession = await signInWithQuantumOAuth(provider);
        if (!nextSession) return false;
        setSession(nextSession);
        return true;
      },
      signOut: async () => {
        const { error } = await getSupabaseClient().auth.signOut();
        if (error) throw error;
        setSession(null);
      },
    }),
    [configError, isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
