export const STUDY_DISCOVERY_STORAGE_KEY = 'quantum.meetups.course-filters.v1'
export type StudyDiscoveryPreferences = { department: string; year?: number }

/** Tab-local discovery choices are not profile data or room authorization. */
export function parseStudyDiscoveryPreferences(value: string | null): StudyDiscoveryPreferences | null {
  if (!value || value.length > 1000) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const { department, year } = parsed as Record<string, unknown>
    if (typeof department !== 'string' || department.length > 120 || /[\u0000-\u001f\u007f]/.test(department)) return null
    if (year !== undefined && (typeof year !== 'number' || !Number.isInteger(year) || year < 1 || year > 6)) return null
    return { department: department.trim(), ...(year === undefined ? {} : { year }) }
  } catch { return null }
}
