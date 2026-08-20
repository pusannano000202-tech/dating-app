type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SocialApiClientOptions = {
  origin: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  allowInsecureLoopbackHttp?: boolean;
};

export type MobileFriendRequest = {
  id: string;
  senderUserId: string;
  receiverUserId: string | null;
  senderDisplayName: string | null;
  receiverDisplayName: string | null;
  status: string;
  message: string | null;
  createdAt: string;
};

export type MobileFriend = {
  userId: string;
  displayName: string | null;
  status: string;
};

export type MobileFriendsSnapshot = {
  sent: MobileFriendRequest[];
  received: MobileFriendRequest[];
  friends: MobileFriend[];
  currentUserId: string | null;
};

export type MobileDepartmentSuggestion = {
  userId: string;
  displayName: string | null;
};

export type MobileDepartmentDiscovery = {
  suggestions: MobileDepartmentSuggestion[];
  discoveryEnabled: boolean;
};

export type MobileGroupInvite = {
  id: string;
  groupId: string;
};

export type MobileNotification = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type MobileFriendDateProposalKind = 'meal' | 'cafe' | 'walk' | 'custom';
export type MobileFriendDateProposalStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type MobileFriendDateProposal = {
  id: string;
  proposerUserId: string;
  recipientUserId: string;
  otherUserId: string;
  otherDisplayName: string | null;
  kind: MobileFriendDateProposalKind;
  message: string | null;
  status: MobileFriendDateProposalStatus;
  respondedAt: string | null;
  createdAt: string;
};

export class SocialApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'SocialApiError';
  }
}

export function createSocialApiClient({
  origin,
  getAccessToken,
  fetchImpl = fetch,
  allowInsecureLoopbackHttp = process.env.NODE_ENV !== 'production',
}: SocialApiClientOptions) {
  const apiOrigin = normalizeOrigin(origin, allowInsecureLoopbackHttp);

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new SocialApiError('auth_required', 401);

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetchImpl(`${apiOrigin}${path}`, { ...init, headers });
    } catch {
      throw new SocialApiError('network_error');
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const code = isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : response.status === 401 ? 'auth_required' : 'request_failed';
      throw new SocialApiError(code, response.status);
    }
    return payload;
  }

  return {
    async listFriends(): Promise<MobileFriendsSnapshot> {
      return parseFriendsSnapshot(await request('/api/friend-requests', { cache: 'no-store' }));
    },

    async respondToFriendRequest(id: string, decision: 'accept' | 'decline'): Promise<void> {
      await request(`/api/friend-requests/${encodeURIComponent(requireValue(id, 'request_id_required'))}/${decision}`, {
        method: 'POST',
      });
    },

    async sendFriendRequest(receiverUserId: string): Promise<void> {
      await request('/api/friend-requests', {
        method: 'POST',
        body: JSON.stringify({ receiver_user_id: requireValue(receiverUserId, 'receiver_required') }),
      });
    },

    async setDepartmentDiscovery(enabled: boolean, limit = 24): Promise<MobileDepartmentDiscovery> {
      const payload = await request('/api/friends/department-sync', {
        method: 'POST',
        body: JSON.stringify({ enabled, limit: Math.max(1, Math.min(50, Math.floor(limit))) }),
      });
      return parseDepartmentDiscovery(payload);
    },

    async getGroupInvite(token: string): Promise<MobileGroupInvite> {
      const safeToken = requireValue(token, 'token_required');
      return parseGroupInvite(await request(`/api/group-invites?token=${encodeURIComponent(safeToken)}`));
    },

    async acceptGroupInvite(token: string): Promise<void> {
      await request('/api/group-invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token: requireValue(token, 'token_required') }),
      });
    },

    async listNotifications({ unreadOnly = false, limit = 50 } = {}): Promise<MobileNotification[]> {
      const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
      const payload = await request(`/api/notifications?limit=${safeLimit}&unread=${unreadOnly ? 'true' : 'false'}`, {
        cache: 'no-store',
      });
      if (!isRecord(payload) || !Array.isArray(payload.notifications)) throw new SocialApiError('invalid_response');
      return payload.notifications.map(parseNotification);
    },

    async markNotificationRead(notificationId: string): Promise<void> {
      await request('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ notification_id: requireValue(notificationId, 'notification_id_required') }),
      });
    },

    async markAllNotificationsRead(): Promise<void> {
      await request('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
      });
    },

    async listFriendDateProposals(friendUserId: string): Promise<MobileFriendDateProposal[]> {
      const safeFriendId = requireValue(friendUserId, 'friend_user_id_required');
      const payload = await request(
        `/api/friend-date-proposals?friend_user_id=${encodeURIComponent(safeFriendId)}`,
        { cache: 'no-store' },
      );
      if (!isRecord(payload) || !Array.isArray(payload.proposals)) throw new SocialApiError('invalid_response');
      return payload.proposals.map(parseFriendDateProposal);
    },

    async createFriendDateProposal(
      recipientUserId: string,
      kind: MobileFriendDateProposalKind,
      message?: string,
    ): Promise<string> {
      const payload = await request('/api/friend-date-proposals', {
        method: 'POST',
        body: JSON.stringify({
          recipient_user_id: requireValue(recipientUserId, 'recipient_required'),
          kind,
          message: message?.trim() || null,
        }),
      });
      if (!isRecord(payload) || typeof payload.proposal_id !== 'string') throw new SocialApiError('invalid_response');
      return payload.proposal_id;
    },

    async respondToFriendDateProposal(proposalId: string, accept: boolean): Promise<MobileFriendDateProposalStatus> {
      const payload = await request(
        `/api/friend-date-proposals/${encodeURIComponent(requireValue(proposalId, 'proposal_id_required'))}/respond`,
        { method: 'POST', body: JSON.stringify({ accept }) },
      );
      if (!isRecord(payload) || (payload.status !== 'accepted' && payload.status !== 'declined')) {
        throw new SocialApiError('invalid_response');
      }
      return payload.status;
    },

    async cancelFriendDateProposal(proposalId: string): Promise<void> {
      await request(
        `/api/friend-date-proposals/${encodeURIComponent(requireValue(proposalId, 'proposal_id_required'))}/cancel`,
        { method: 'POST' },
      );
    },
  };
}

let socialClientPromise: Promise<ReturnType<typeof createSocialApiClient>> | null = null;

export async function getSocialApiClient() {
  if (socialClientPromise) return socialClientPromise;
  socialClientPromise = Promise.all([
    import('../config/runtime'),
    import('../lib/supabase'),
  ]).then(([{ readMobileConfig }, { getSupabaseClient }]) => {
    const runtime = readMobileConfig();
    const supabase = getSupabaseClient();
    return createSocialApiClient({
      origin: runtime.apiOrigin,
      getAccessToken: async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) return null;
        return data.session?.access_token ?? null;
      },
    });
  }).catch((error) => {
    socialClientPromise = null;
    throw error;
  });
  return socialClientPromise;
}

function parseFriendsSnapshot(payload: unknown): MobileFriendsSnapshot {
  if (!isRecord(payload) || !Array.isArray(payload.sent) || !Array.isArray(payload.received) || !Array.isArray(payload.friends)) {
    throw new SocialApiError('invalid_response');
  }
  return {
    sent: payload.sent.map(parseFriendRequest),
    received: payload.received.map(parseFriendRequest),
    friends: payload.friends.map(parseFriend),
    currentUserId: typeof payload.current_user_id === 'string' ? payload.current_user_id : null,
  };
}

function parseFriendRequest(value: unknown): MobileFriendRequest {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.sender_user_id !== 'string' || typeof value.status !== 'string' || typeof value.created_at !== 'string') {
    throw new SocialApiError('invalid_response');
  }
  return {
    id: value.id,
    senderUserId: value.sender_user_id,
    receiverUserId: typeof value.receiver_user_id === 'string' ? value.receiver_user_id : null,
    senderDisplayName: typeof value.sender_display_name === 'string' ? value.sender_display_name : null,
    receiverDisplayName: typeof value.receiver_display_name === 'string' ? value.receiver_display_name : null,
    status: value.status,
    message: typeof value.message === 'string' ? value.message : null,
    createdAt: value.created_at,
  };
}

function parseFriend(value: unknown): MobileFriend {
  if (!isRecord(value) || typeof value.user_id !== 'string' || typeof value.status !== 'string') {
    throw new SocialApiError('invalid_response');
  }
  return {
    userId: value.user_id,
    displayName: typeof value.display_name === 'string' ? value.display_name : null,
    status: value.status,
  };
}

function parseDepartmentDiscovery(payload: unknown): MobileDepartmentDiscovery {
  if (!isRecord(payload) || !Array.isArray(payload.suggestions) || typeof payload.discovery_enabled !== 'boolean') {
    throw new SocialApiError('invalid_response');
  }
  return {
    discoveryEnabled: payload.discovery_enabled,
    suggestions: payload.suggestions.map((value) => {
      if (!isRecord(value) || typeof value.user_id !== 'string') throw new SocialApiError('invalid_response');
      return {
        userId: value.user_id,
        displayName: typeof value.display_name === 'string' ? value.display_name : null,
      };
    }),
  };
}

function parseGroupInvite(payload: unknown): MobileGroupInvite {
  if (!isRecord(payload) || !isRecord(payload.invite) || typeof payload.invite.id !== 'string' || typeof payload.invite.group_id !== 'string') {
    throw new SocialApiError('invalid_response');
  }
  return { id: payload.invite.id, groupId: payload.invite.group_id };
}

function parseNotification(value: unknown): MobileNotification {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.kind !== 'string' || typeof value.created_at !== 'string') {
    throw new SocialApiError('invalid_response');
  }
  return {
    id: value.id,
    kind: value.kind,
    payload: isRecord(value.payload) ? value.payload : {},
    readAt: typeof value.read_at === 'string' ? value.read_at : null,
    createdAt: value.created_at,
  };
}

function parseFriendDateProposal(value: unknown): MobileFriendDateProposal {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.proposer_user_id !== 'string'
    || typeof value.recipient_user_id !== 'string'
    || typeof value.other_user_id !== 'string'
    || !isFriendDateKind(value.kind)
    || !isFriendDateStatus(value.status)
    || typeof value.created_at !== 'string'
  ) {
    throw new SocialApiError('invalid_response');
  }
  return {
    id: value.id,
    proposerUserId: value.proposer_user_id,
    recipientUserId: value.recipient_user_id,
    otherUserId: value.other_user_id,
    otherDisplayName: typeof value.other_display_name === 'string' ? value.other_display_name : null,
    kind: value.kind,
    message: typeof value.message === 'string' ? value.message : null,
    status: value.status,
    respondedAt: typeof value.responded_at === 'string' ? value.responded_at : null,
    createdAt: value.created_at,
  };
}

function isFriendDateKind(value: unknown): value is MobileFriendDateProposalKind {
  return value === 'meal' || value === 'cafe' || value === 'walk' || value === 'custom';
}

function isFriendDateStatus(value: unknown): value is MobileFriendDateProposalStatus {
  return value === 'pending' || value === 'accepted' || value === 'declined' || value === 'cancelled';
}

function normalizeOrigin(origin: string, allowInsecureLoopbackHttp: boolean): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new SocialApiError('invalid_api_origin');
  }
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(allowInsecureLoopbackHttp && isLoopback && url.protocol === 'http:')) {
    throw new SocialApiError('insecure_api_origin');
  }
  return url.origin;
}

function requireValue(value: string, code: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new SocialApiError(code, 400);
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
