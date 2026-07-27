type AuthSettingsResponse = {
  ok: boolean
  json: () => Promise<unknown>
}

type AuthSettingsFetcher = (
  url: string,
  init: {
    cache: 'no-store'
    headers: {
      apikey: string
    }
  }
) => Promise<AuthSettingsResponse>

type GoogleOAuthAvailabilityOptions = {
  supabaseUrl: string
  publicKey: string
  fetcher: AuthSettingsFetcher
}

export async function isGoogleOAuthProviderEnabled({
  supabaseUrl,
  publicKey,
  fetcher,
}: GoogleOAuthAvailabilityOptions): Promise<boolean> {
  if (!supabaseUrl || !publicKey) return false

  try {
    const response = await fetcher(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
      cache: 'no-store',
      headers: {
        apikey: publicKey,
      },
    })
    if (!response.ok) return false

    const settings = await response.json()
    if (!settings || typeof settings !== 'object') return false

    const external = Reflect.get(settings, 'external')
    return Boolean(
      external &&
      typeof external === 'object' &&
      Reflect.get(external, 'google') === true
    )
  } catch {
    return false
  }
}
