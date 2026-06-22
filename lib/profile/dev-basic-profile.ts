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
): Gender | null {
  try {
    const stored = readStoredProfile()
    if (!stored) return null
    const parsed = JSON.parse(stored) as { gender?: unknown }
    return normalizeGender(parsed.gender)
  } catch {
    return null
  }
}
