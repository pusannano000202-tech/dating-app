import { createContext, type PropsWithChildren, useContext, useMemo, useReducer } from 'react';

import {
  participationReducer,
  type Participation,
} from './participation-reducer';

type ParticipationContextValue = {
  participation: Participation | null;
  join: (eventId: string) => void;
  cancel: () => void;
};

const ParticipationContext = createContext<ParticipationContextValue | null>(null);

export function ParticipationProvider({ children }: PropsWithChildren) {
  const [participation, dispatch] = useReducer(participationReducer, null);
  const value = useMemo(
    () => ({
      participation,
      join: (eventId: string) => dispatch({ type: 'join', eventId }),
      cancel: () => dispatch({ type: 'cancel' }),
    }),
    [participation],
  );

  return <ParticipationContext.Provider value={value}>{children}</ParticipationContext.Provider>;
}
export function useParticipation() {
  const value = useContext(ParticipationContext);
  if (!value) throw new Error('useParticipation must be used inside ParticipationProvider');
  return value;
}
