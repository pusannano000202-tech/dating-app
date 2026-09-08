import { readMobileConfig } from '../config/runtime';

export const MEETUP_CATEGORIES = [
  'baseball',
  'soccer',
  'basketball',
  'badminton',
  'tennis',
  'running',
  'board_game',
  'gaming',
  'hiking',
  'walking',
  'dining',
  'study',
  'other',
] as const;

export type MeetupCategory = (typeof MEETUP_CATEGORIES)[number];
export type MeetupAvailability = 'ready' | 'auth_required' | 'schema_unavailable';

export type MobileMeetup = {
  id: string;
  category: MeetupCategory;
  title: string;
  description: string;
  place_name: string;
  scheduled_at: string;
  capacity: number;
  status: 'open' | 'full';
  member_count: number;
  joined: boolean;
  is_host: boolean;
  created_at: string;
};

export type CreateMeetupInput = {
  category: MeetupCategory;
  title: string;
  description: string;
  placeName: string;
  scheduledAt: string;
  capacity: number;
};

export type MeetupMembership = {
  joined: boolean;
  reused: boolean;
  memberCount: number | null;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type CreateMeetupsApiClientOptions = {
  origin: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
};

export class MeetupApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'MeetupApiError';
  }
}

export function createMeetupsApiClient({
  origin,
  getAccessToken,
  fetchImpl = fetch,
}: CreateMeetupsApiClientOptions) {
  const apiOrigin = normalizeOrigin(origin);

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await getAccessToken();
    if (!token) throw new MeetupApiError('auth_required', 401);

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetchImpl(`${apiOrigin}${path}`, { ...init, headers });
    } catch {
      throw new MeetupApiError('network_error');
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      throw new MeetupApiError(readErrorCode(payload) ?? 'request_failed', response.status);
    }
    return payload;
  }

  return {
    async list(category?: MeetupCategory): Promise<{
      meetups: MobileMeetup[];
      availability: MeetupAvailability;
    }> {
      const query = category ? `?category=${encodeURIComponent(category)}` : '';
      const payload = await request(`/api/meetups${query}`, { cache: 'no-store' });
      if (!isRecord(payload) || !isMeetupAvailability(payload.availability) || !Array.isArray(payload.meetups)) {
        throw new MeetupApiError('invalid_response');
      }
      return {
        availability: payload.availability,
        meetups: payload.meetups.map(parseMeetup),
      };
    },

    async create(input: CreateMeetupInput): Promise<MobileMeetup> {
      const payload = await request('/api/meetups', {
        method: 'POST',
        body: JSON.stringify({
          category: input.category,
          title: input.title,
          description: input.description,
          place_name: input.placeName,
          scheduled_at: input.scheduledAt,
          capacity: input.capacity,
        }),
      });
      if (!isRecord(payload)) throw new MeetupApiError('invalid_response');
      return parseMeetup(payload.meetup);
    },

    async join(meetupId: string): Promise<MeetupMembership> {
      return changeMembership(meetupId, 'POST');
    },

    async leave(meetupId: string): Promise<MeetupMembership> {
      return changeMembership(meetupId, 'DELETE');
    },
  };

  async function changeMembership(meetupId: string, method: 'POST' | 'DELETE') {
    if (!isUuid(meetupId)) throw new MeetupApiError('invalid_meetup_id', 400);
    const payload = await request(`/api/meetups/${meetupId}/join`, { method });
    if (!isRecord(payload) || !isRecord(payload.membership) || typeof payload.membership.joined !== 'boolean') {
      throw new MeetupApiError('invalid_response');
    }
    return {
      joined: payload.membership.joined,
      reused: payload.membership.reused === true,
      memberCount: readOptionalInteger(payload.membership.member_count),
    };
  }
}

let singleton: ReturnType<typeof createMeetupsApiClient> | null = null;

export function getMeetupsApiClient() {
  if (singleton) return singleton;
  const runtime = readMobileConfig();
  singleton = createMeetupsApiClient({
    origin: runtime.apiOrigin,
    getAccessToken: async () => {
      const { getSupabaseClient } = await import('../lib/supabase');
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    },
  });
  return singleton;
}

export function toMeetupScheduleIso(dateText: string, timeText: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) {
    throw new MeetupApiError('invalid_schedule');
  }

  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  const scheduledAt = new Date(year, month - 1, day, hour, minute, 0, 0);
  const valid = scheduledAt.getFullYear() === year
    && scheduledAt.getMonth() === month - 1
    && scheduledAt.getDate() === day
    && scheduledAt.getHours() === hour
    && scheduledAt.getMinutes() === minute;

  if (!valid) throw new MeetupApiError('invalid_schedule');
  if (scheduledAt.getTime() < now.getTime() + 30 * 60 * 1000) {
    throw new MeetupApiError('schedule_too_soon');
  }
  return scheduledAt.toISOString();
}

function parseMeetup(value: unknown): MobileMeetup {
  if (
    !isRecord(value)
    || !isUuid(value.id)
    || !isMeetupCategory(value.category)
    || !isStringLength(value.title, 4, 60)
    || !isStringLength(value.description, 0, 500)
    || !isStringLength(value.place_name, 2, 80)
    || !isIsoDate(value.scheduled_at)
    || !isIntegerInRange(value.capacity, 2, 20)
    || (value.status !== 'open' && value.status !== 'full')
    || !isIntegerInRange(value.member_count, 0, 20)
    || value.member_count > value.capacity
    || typeof value.joined !== 'boolean'
    || typeof value.is_host !== 'boolean'
    || !isIsoDate(value.created_at)
  ) {
    throw new MeetupApiError('invalid_response');
  }
  return value as MobileMeetup;
}

function normalizeOrigin(origin: string): string {
  const normalized = origin.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new MeetupApiError('invalid_api_origin');
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback(parsed.hostname))) {
    throw new MeetupApiError('insecure_api_origin');
  }
  return normalized;
}

function isLoopback(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMeetupAvailability(value: unknown): value is MeetupAvailability {
  return value === 'ready' || value === 'auth_required' || value === 'schema_unavailable';
}

function isMeetupCategory(value: unknown): value is MeetupCategory {
  return typeof value === 'string' && MEETUP_CATEGORIES.includes(value as MeetupCategory);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isStringLength(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function readOptionalInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readErrorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.error === 'string' ? value.error : null;
}
