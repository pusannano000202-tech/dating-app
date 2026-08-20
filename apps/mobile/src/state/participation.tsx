import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { getQuantumApiClient } from '../api/quantum';
import type { MobileParticipation, QuantumPartyType } from '../api/client';
import { useAuth } from '../auth/context';

type ParticipationContextValue = {
  participation: MobileParticipation | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  join: (eventId: string, partyType: QuantumPartyType) => Promise<void>;
  cancel: () => Promise<void>;
  reload: () => Promise<void>;
};

const ParticipationContext = createContext<ParticipationContextValue | null>(null);

export function ParticipationProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [participation, setParticipation] = useState<MobileParticipation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!session) {
      setParticipation(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setParticipation(await getQuantumApiClient().getParticipation());
    } catch {
      setError('참여 정보를 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [session?.user.id]);

  const value = useMemo<ParticipationContextValue>(
    () => ({
      participation,
      isLoading,
      isSaving,
      error,
      reload,
      join: async (eventId, partyType) => {
        setIsSaving(true);
        setError(null);
        try {
          setParticipation(await getQuantumApiClient().joinEvent(eventId, partyType));
        } catch {
          setError('참여를 저장하지 못했어요.');
          throw new Error('participation_save_failed');
        } finally {
          setIsSaving(false);
        }
      },
      cancel: async () => {
        setIsSaving(true);
        setError(null);
        try {
          await getQuantumApiClient().cancelParticipation();
          setParticipation(null);
        } catch {
          setError('참여 취소에 실패했어요.');
          throw new Error('participation_cancel_failed');
        } finally {
          setIsSaving(false);
        }
      },
    }),
    [error, isLoading, isSaving, participation, session?.user.id],
  );

  return <ParticipationContext.Provider value={value}>{children}</ParticipationContext.Provider>;
}

export function useParticipation() {
  const value = useContext(ParticipationContext);
  if (!value) throw new Error('useParticipation must be used inside ParticipationProvider');
  return value;
}
