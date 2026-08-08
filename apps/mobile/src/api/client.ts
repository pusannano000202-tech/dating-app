import type { TonightEvent, TonightEventKind } from '../domain/events';

export type QuantumPartyType = 'solo' | 'friends';

export type MobileParticipation = {
  eventId: string;
  eventMode: 'tonight' | 'scheduled';
  partyType: QuantumPartyType;
  updatedAt: string;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type QuantumApiClientOptions = {
  origin: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
};

export class QuantumApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'QuantumApiError';
  }
}

export function createQuantumApiClient({
  origin,
  getAccessToken,
  fetchImpl = fetch,
}: QuantumApiClientOptions) {
  const apiOrigin = normalizeOrigin(origin);

  async function request(path: string, init: RequestInit = {}, requireAuth = false): Promise<unknown> {
    const headers = new Headers(init.headers);
    const accessToken = await getAccessToken();

    if (requireAuth && !accessToken) throw new QuantumApiError('auth_required', 401);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetchImpl(`${apiOrigin}${path}`, { ...init, headers });
    } catch {
      throw new QuantumApiError('network_error');
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const code = readErrorCode(payload) ?? (response.status === 401 ? 'auth_required' : 'request_failed');
      throw new QuantumApiError(code, response.status);
    }
    return payload;
  }

  return {
    async listEvents(): Promise<{ tonight: TonightEvent[]; scheduled: TonightEvent[] }> {
      const payload = await request('/api/match/events');
      return parseEventCatalog(payload);
    },

    async getParticipation(): Promise<MobileParticipation | null> {
      const payload = await request('/api/match/event-participation', { cache: 'no-store' }, true);
      return parseParticipationEnvelope(payload, true);
    },

    async joinEvent(eventId: string, partyType: QuantumPartyType): Promise<MobileParticipation> {
      const payload = await request(
        '/api/match/event-participation',
        {
          method: 'POST',
          body: JSON.stringify({ event_id: eventId, party_type: partyType }),
        },
        true,
      );
      const participation = parseParticipationEnvelope(payload);
      if (!participation) throw new QuantumApiError('invalid_response');
      return participation;
    },

    async cancelParticipation(): Promise<void> {
      const payload = await request(
        '/api/match/event-participation',
        { method: 'DELETE' },
        true,
      );
      if (!isRecord(payload) || payload.participation !== null) {
        throw new QuantumApiError('invalid_response');
      }
    },
  };
}

function parseEventCatalog(value: unknown): { tonight: TonightEvent[]; scheduled: TonightEvent[] } {
  if (!isRecord(value) || value.availability !== 'ready' || !isRecord(value.events)) {
    throw new QuantumApiError('invalid_response');
  }

  const tonight = parseEventList(value.events.tonight, 'tonight');
  const scheduled = parseEventList(value.events.scheduled, 'scheduled');
  return { tonight, scheduled };
}

function parseEventList(value: unknown, expectedMode: 'tonight' | 'scheduled'): TonightEvent[] {
  if (!Array.isArray(value)) throw new QuantumApiError('invalid_response');
  return value.map((event) => parseEvent(event, expectedMode));
}

function parseEvent(value: unknown, expectedMode: 'tonight' | 'scheduled'): TonightEvent {
  if (!isRecord(value)) throw new QuantumApiError('invalid_response');
  const kind = parseKind(value.kind);
  const remaining = value.remaining === null ? null : readInteger(value.remaining, 0, 5);

  if (
    !readString(value.id)
    || value.mode !== expectedMode
    || !readString(value.eyebrow)
    || !readString(value.title)
    || !readString(value.description)
    || !readString(value.location)
    || !readString(value.schedule)
    || value.total_people !== 5
    || !isBalancedCount(value.male_count)
    || !isBalancedCount(value.female_count)
    || Number(value.male_count) + Number(value.female_count) !== 5
    || !kind
    || remaining === undefined
  ) {
    throw new QuantumApiError('invalid_response');
  }

  return {
    id: value.id as string,
    kind: toMobileKind(kind),
    scheduleType: expectedMode,
    eyebrow: value.eyebrow as string,
    title: value.title as string,
    description: value.description as string,
    venue: value.location as string,
    meetingTime: value.schedule as string,
    capacity: 5,
    remaining,
    imageKey: toMobileKind(kind),
  };
}

function parseParticipationEnvelope(value: unknown, requireReady = false): MobileParticipation | null {
  if (!isRecord(value)) throw new QuantumApiError('invalid_response');
  if (requireReady && value.availability !== 'ready') {
    throw new QuantumApiError(readString(value.availability) ? value.availability : 'invalid_response');
  }
  if (value.participation === null) return null;
  if (!isRecord(value.participation)) throw new QuantumApiError('invalid_response');

  const participation = value.participation;
  if (
    !readString(participation.event_id)
    || (participation.event_mode !== 'tonight' && participation.event_mode !== 'scheduled')
    || (participation.party_type !== 'solo' && participation.party_type !== 'friends')
    || !readString(participation.updated_at)
  ) {
    throw new QuantumApiError('invalid_response');
  }

  return {
    eventId: participation.event_id as string,
    eventMode: participation.event_mode,
    partyType: participation.party_type,
    updatedAt: participation.updated_at as string,
  };
}

function parseKind(value: unknown): 'run' | 'walk' | 'board-game' | 'drinks' | 'dinner' | null {
  return value === 'run' || value === 'walk' || value === 'board-game' || value === 'drinks' || value === 'dinner'
    ? value
    : null;
}

function toMobileKind(kind: 'run' | 'walk' | 'board-game' | 'drinks' | 'dinner'): TonightEventKind {
  return kind === 'run' || kind === 'walk' ? 'jogging' : kind;
}

function isBalancedCount(value: unknown): value is 2 | 3 {
  return value === 2 || value === 3;
}

function readInteger(value: unknown, min: number, max: number): number | undefined {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : undefined;
}

function readString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readErrorCode(value: unknown): string | null {
  return isRecord(value) && readString(value.error) ? value.error : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOrigin(origin: string): string {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) throw new QuantumApiError('invalid_api_origin');
  return normalized;
}
