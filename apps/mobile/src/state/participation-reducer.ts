export type Participation = {
  eventId: string;
};

export type ParticipationAction =
  | { type: 'join'; eventId: string }
  | { type: 'cancel' };

export function participationReducer(
  _state: Participation | null,
  action: ParticipationAction,
): Participation | null {
  if (action.type === 'cancel') return null;
  return { eventId: action.eventId };
}
