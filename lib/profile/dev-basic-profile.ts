import { normalizeGender } from '../gender'
import type { Gender } from '../types'

export const DEV_BASIC_PROFILE_STORAGE_KEY = 'booting_dev_basic_profile'

export function readDevBasicProfileGender(
  readStoredProfile: () => string | null = () => {
    const storage = (globalThis as {
      sessionStorage?: { getItem: (key: string) => string | null }
    }).sessionStorage
    if (!storage) return null
    return storage.getItem(DEV_BASIC_PROFILE_STORAGE_KEY)
  },
): Gender {
  try {
    const stored = readStoredProfile()
    if (!stored) return 'female'
    const parsed = JSON.parse(stored) as { gender?: unknown }
    return normalizeGender(parsed.gender) ?? 'female'
  } catch {
    return 'female'
  }
}
