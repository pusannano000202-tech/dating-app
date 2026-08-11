import { readMobileConfig } from '../config/runtime';

export type MeetingAlbumOperations = {
  startsAt: string;
  endsAt: string;
  evidenceUploadOpensAt: string;
  evidenceUploadClosesAt: string;
  phase: 'scheduled' | 'check_in' | 'in_progress' | 'complete' | 'closed';
  canUploadEvidence: boolean;
};

export type MeetingAlbumPhoto = {
  id: string;
  signedUrl: string;
  submittedAt: string;
  capturedAt: string | null;
  status: string;
  mine: boolean;
  expiresIn: 300;
};

export type MeetingAlbum = {
  operations: MeetingAlbumOperations;
  photos: MeetingAlbumPhoto[];
};

export type MobileAlbumMatch = {
  matchId: string;
  matchStatus: string;
  scheduledStart: string | null;
  venueName: string | null;
};

export type MeetingEvidenceUpload = {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png' | 'image/webp';
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type FormDataLike = { append(name: string, value: unknown): void };

type MeetingAlbumApiOptions = {
  origin: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  formDataFactory?: () => FormDataLike;
  allowInsecureLoopbackHttp?: boolean;
};

export class MeetingAlbumApiError extends Error {
  constructor(public readonly code: string, public readonly status?: number) {
    super(code);
    this.name = 'MeetingAlbumApiError';
  }
}

export function createMeetingAlbumApi({
  origin,
  getAccessToken,
  fetchImpl = fetch,
  formDataFactory = () => new FormData(),
  allowInsecureLoopbackHttp = process.env.NODE_ENV !== 'production',
}: MeetingAlbumApiOptions) {
  const apiOrigin = normalizeOrigin(origin, allowInsecureLoopbackHttp);

  async function requestPath(path: string, init: RequestInit = {}) {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new MeetingAlbumApiError('auth_required', 401);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);

    let response: Response;
    try {
      response = await fetchImpl(`${apiOrigin}${path}`, { ...init, headers });
    } catch {
      throw new MeetingAlbumApiError('network_error');
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      throw new MeetingAlbumApiError(readErrorCode(payload) ?? 'request_failed', response.status);
    }
    return payload;
  }

  async function request(matchId: string, suffix: string, init: RequestInit = {}) {
    if (!isSafeId(matchId)) throw new MeetingAlbumApiError('match_id_invalid', 400);
    return requestPath(`/api/matches/${encodeURIComponent(matchId)}/${suffix}`, init);
  }

  return {
    async listMatches(): Promise<MobileAlbumMatch[]> {
      return parseMatches(await requestPath('/api/matches', { cache: 'no-store' }));
    },

    async getAlbum(matchId: string): Promise<MeetingAlbum> {
      return parseAlbum(await request(matchId, 'album', { cache: 'no-store' }));
    },

    async uploadEvidence(matchId: string, photo: MeetingEvidenceUpload): Promise<void> {
      if (!isValidUpload(photo)) throw new MeetingAlbumApiError('photo_file_invalid', 400);
      const formData = formDataFactory();
      formData.append('photo', photo);
      const payload = await request(matchId, 'evidence-photo', {
        method: 'POST',
        body: formData as unknown as BodyInit,
      });
      if (!isRecord(payload) || !isRecord(payload.evidence) || !readString(payload.evidence.id)) {
        throw new MeetingAlbumApiError('invalid_response');
      }
    },
  };
}

function parseMatches(value: unknown): MobileAlbumMatch[] {
  if (!isRecord(value) || !Array.isArray(value.matches)) {
    throw new MeetingAlbumApiError('invalid_response');
  }
  return value.matches.map((match) => {
    if (!isRecord(match) || !readString(match.match_id) || !readString(match.match_status)) {
      throw new MeetingAlbumApiError('invalid_response');
    }
    const scheduledStart = match.scheduled_start === null ? null : readIso(match.scheduled_start) ? match.scheduled_start : undefined;
    const venueName = match.venue_name === null ? null : readString(match.venue_name) ? match.venue_name : undefined;
    if (scheduledStart === undefined || venueName === undefined) throw new MeetingAlbumApiError('invalid_response');
    return {
      matchId: match.match_id,
      matchStatus: match.match_status,
      scheduledStart,
      venueName,
    };
  });
}

let defaultClient: ReturnType<typeof createMeetingAlbumApi> | null = null;

export function getMeetingAlbumApi() {
  if (defaultClient) return defaultClient;
  const runtime = readMobileConfig(process.env);
  defaultClient = createMeetingAlbumApi({
    origin: runtime.apiOrigin,
    getAccessToken: async () => {
      const { getSupabaseClient } = await import('../lib/supabase');
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    },
  });
  return defaultClient;
}

function parseAlbum(value: unknown): MeetingAlbum {
  if (!isRecord(value) || !isRecord(value.operations) || !Array.isArray(value.photos)) {
    throw new MeetingAlbumApiError('invalid_response');
  }
  const operations = parseOperations(value.operations);
  const photos = value.photos.map(parsePhoto);
  if (!operations || photos.some((photo) => photo === null)) {
    throw new MeetingAlbumApiError('invalid_response');
  }
  return { operations, photos: photos as MeetingAlbumPhoto[] };
}

function parseOperations(value: Record<string, unknown>): MeetingAlbumOperations | null {
  const phase = value.phase === 'scheduled'
    || value.phase === 'check_in'
    || value.phase === 'in_progress'
    || value.phase === 'complete'
    || value.phase === 'closed'
    ? value.phase
    : null;
  if (
    !phase
    || !readIso(value.starts_at)
    || !readIso(value.ends_at)
    || !readIso(value.evidence_upload_opens_at)
    || !readIso(value.evidence_upload_closes_at)
    || typeof value.can_upload_evidence !== 'boolean'
  ) return null;
  return {
    startsAt: value.starts_at,
    endsAt: value.ends_at,
    evidenceUploadOpensAt: value.evidence_upload_opens_at,
    evidenceUploadClosesAt: value.evidence_upload_closes_at,
    phase,
    canUploadEvidence: value.can_upload_evidence,
  };
}

function parsePhoto(value: unknown): MeetingAlbumPhoto | null {
  if (
    !isRecord(value)
    || !readString(value.id)
    || !readHttpsUrl(value.signed_url)
    || !readIso(value.submitted_at)
    || !(value.captured_at === null || readIso(value.captured_at))
    || !readString(value.status)
    || typeof value.mine !== 'boolean'
    || value.expires_in !== 300
  ) return null;
  return {
    id: value.id,
    signedUrl: value.signed_url,
    submittedAt: value.submitted_at,
    capturedAt: value.captured_at,
    status: value.status,
    mine: value.mine,
    expiresIn: 300,
  };
}

function isValidUpload(value: MeetingEvidenceUpload): boolean {
  return readString(value.uri)
    && readString(value.name)
    && (value.type === 'image/jpeg' || value.type === 'image/png' || value.type === 'image/webp');
}

function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function normalizeOrigin(origin: string, allowInsecureLoopbackHttp: boolean): string {
  const normalized = origin.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new MeetingAlbumApiError('invalid_api_origin');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (
    url.username
    || url.password
    || url.search
    || url.hash
    || (url.protocol !== 'https:' && !(allowInsecureLoopbackHttp && url.protocol === 'http:' && loopback))
  ) throw new MeetingAlbumApiError('invalid_api_origin');
  return normalized;
}

function readErrorCode(value: unknown): string | null {
  return isRecord(value) && readString(value.error) ? value.error : null;
}

function readHttpsUrl(value: unknown): value is string {
  if (!readString(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function readIso(value: unknown): value is string {
  return readString(value) && Number.isFinite(Date.parse(value));
}

function readString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
