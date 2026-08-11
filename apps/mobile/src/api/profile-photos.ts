import { readMobileConfig } from '../config/runtime';

const PROFILE_PHOTOS_PATH = '/api/profile/photos';
const MAX_PHOTOS = 3;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ProfilePhotoItem = {
  storagePath: string;
  sortOrder: number;
  signedUrl: string;
};

export type ProfilePhotos = {
  photos: string[];
  items: ProfilePhotoItem[];
};

export type MobilePhotoUpload = {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png' | 'image/webp';
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type FormDataLike = { append(name: string, value: unknown): void };

type ProfilePhotosApiOptions = {
  origin: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  formDataFactory?: () => FormDataLike;
  allowInsecureLoopbackHttp?: boolean;
};

export class ProfilePhotosApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'ProfilePhotosApiError';
  }
}

export function createProfilePhotosApi({
  origin,
  getAccessToken,
  fetchImpl = fetch,
  formDataFactory = () => new FormData(),
  allowInsecureLoopbackHttp = process.env.NODE_ENV !== 'production',
}: ProfilePhotosApiOptions) {
  const apiOrigin = normalizeOrigin(origin, allowInsecureLoopbackHttp);

  async function request(init: RequestInit = {}): Promise<unknown> {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new ProfilePhotosApiError('auth_required', 401);

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);

    let response: Response;
    try {
      response = await fetchImpl(`${apiOrigin}${PROFILE_PHOTOS_PATH}`, { ...init, headers });
    } catch {
      throw new ProfilePhotosApiError('network_error');
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const code = readErrorCode(payload) ?? (response.status === 401 ? 'auth_required' : 'request_failed');
      throw new ProfilePhotosApiError(code, response.status);
    }
    return payload;
  }

  return {
    async listPhotos(): Promise<ProfilePhotos> {
      return parseProfilePhotos(await request({ cache: 'no-store' }));
    },

    async replacePhotos(photos: MobilePhotoUpload[]): Promise<ProfilePhotos> {
      if (photos.length < 1 || photos.length > MAX_PHOTOS) {
        throw new ProfilePhotosApiError('photo_count_invalid', 400);
      }
      if (photos.some((photo) => !isValidUpload(photo))) {
        throw new ProfilePhotosApiError('photo_file_invalid', 400);
      }

      const formData = formDataFactory();
      for (const photo of photos) formData.append('photos', photo);
      return parseProfilePhotos(await request({
        method: 'PUT',
        body: formData as unknown as BodyInit,
      }));
    },

    async deletePhoto(storagePath: string): Promise<void> {
      if (!storagePath.trim()) throw new ProfilePhotosApiError('photo_path_invalid', 400);
      const payload = await request({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: storagePath }),
      });
      if (!isRecord(payload) || payload.ok !== true) {
        throw new ProfilePhotosApiError('invalid_response');
      }
    },
  };
}

let defaultClient: ReturnType<typeof createProfilePhotosApi> | null = null;

export function getProfilePhotosApi() {
  if (defaultClient) return defaultClient;

  const runtime = readMobileConfig(process.env);
  defaultClient = createProfilePhotosApi({
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

function parseProfilePhotos(value: unknown): ProfilePhotos {
  if (!isRecord(value) || !Array.isArray(value.photos) || !Array.isArray(value.items)) {
    throw new ProfilePhotosApiError('invalid_response');
  }
  const photos = value.photos;
  const rawItems = value.items;
  if (
    photos.length > MAX_PHOTOS
    || rawItems.length !== photos.length
    || !photos.every(readString)
  ) {
    throw new ProfilePhotosApiError('invalid_response');
  }

  const items = rawItems.map(parseProfilePhotoItem);
  if (
    items.some((item) => item === null)
    || new Set(items.map((item) => item?.storagePath)).size !== items.length
  ) {
    throw new ProfilePhotosApiError('invalid_response');
  }
  const safeItems = items as ProfilePhotoItem[];
  if (safeItems.some((item, index) => item.signedUrl !== photos[index])) {
    throw new ProfilePhotosApiError('invalid_response');
  }
  return { photos: [...photos], items: safeItems };
}

function parseProfilePhotoItem(value: unknown): ProfilePhotoItem | null {
  if (!isRecord(value) || !readString(value.storage_path) || !readString(value.signed_url)) return null;
  if (!Number.isInteger(value.sort_order) || Number(value.sort_order) < 0) return null;
  return {
    storagePath: value.storage_path,
    sortOrder: Number(value.sort_order),
    signedUrl: value.signed_url,
  };
}

function isValidUpload(value: MobilePhotoUpload): boolean {
  return readString(value.uri)
    && readString(value.name)
    && ALLOWED_PHOTO_TYPES.has(value.type);
}

function normalizeOrigin(origin: string, allowInsecureLoopbackHttp: boolean): string {
  const normalized = origin.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ProfilePhotosApiError('invalid_api_origin');
  }
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (
    url.username
    || url.password
    || url.search
    || url.hash
    || (url.protocol !== 'https:' && !(allowInsecureLoopbackHttp && url.protocol === 'http:' && isLoopback))
  ) {
    throw new ProfilePhotosApiError('invalid_api_origin');
  }
  return normalized;
}

function readErrorCode(value: unknown): string | null {
  return isRecord(value) && readString(value.error) ? value.error : null;
}

function readString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
