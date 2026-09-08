import type { SupabaseClient } from '@supabase/supabase-js'

import { TonightApiInputError } from './api-contract'

type AccessMembership = Record<string, unknown> & {
  user_id: string
  venue_id?: string | null
}

type AccessMembershipLabel = {
  display_name: string | null
  email_hint: string | null
  venue_name?: string | null
}

type UserRow = {
  id: string
  email: string | null
  school_email: string | null
}

type ProfileRow = {
  user_id: string
  display_name: string | null
}

type VenueRow = {
  id: string
  name: string | null
}

/**
 * Adds display-only labels to already-authorized access membership rows.
 *
 * This helper must only be called after a live super-admin guard. It deliberately
 * returns a masked email hint and never returns a phone number or full email.
 */
export async function hydrateTonightAccessMemberships<T extends AccessMembership>(
  service: SupabaseClient,
  memberships: T[],
  options: { includeVenueName?: boolean } = {},
): Promise<{ data: Array<T & AccessMembershipLabel> | null; error: unknown | null }> {
  const userIds = [...new Set(memberships.map((membership) => membership.user_id))]
  const venueIds = options.includeVenueName
    ? [...new Set(memberships
      .map((membership) => membership.venue_id)
      .filter((venueId): venueId is string => typeof venueId === 'string'))]
    : []

  const [usersResult, profilesResult, venuesResult] = await Promise.all([
    userIds.length > 0
      ? service.from('users').select('id,email,school_email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? service.from('profiles').select('user_id,display_name').in('user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    venueIds.length > 0
      ? service.from('venues').select('id,name').in('id', venueIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const error = usersResult.error ?? profilesResult.error ?? venuesResult.error
  if (error) return { data: null, error }

  const usersById = new Map(
    ((usersResult.data ?? []) as UserRow[]).map((user) => [user.id, user]),
  )
  const profilesById = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]),
  )
  const venuesById = new Map(
    ((venuesResult.data ?? []) as VenueRow[]).map((venue) => [venue.id, venue]),
  )

  return {
    data: memberships.map((membership) => {
      const user = usersById.get(membership.user_id)
      const profile = profilesById.get(membership.user_id)
      return {
        ...membership,
        display_name: profile?.display_name ?? null,
        email_hint: maskEmail(user?.school_email ?? user?.email ?? null),
        ...(options.includeVenueName
          ? { venue_name: membership.venue_id
            ? venuesById.get(membership.venue_id)?.name ?? null
            : null }
          : {}),
      }
    }),
    error: null,
  }
}

export function assertStrictSearchParams(
  request: Request,
  allowedKeys: readonly string[],
): URLSearchParams {
  const searchParams = new URL(request.url).searchParams
  const allowed = new Set(allowedKeys)
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      throw new TonightApiInputError('unexpected_field', key)
    }
  }
  return searchParams
}

function maskEmail(value: string | null): string | null {
  if (!value) return null
  const [local, domain] = value.split('@')
  if (!local || !domain) return null
  return `${local.slice(0, 2)}***@${domain}`
}
