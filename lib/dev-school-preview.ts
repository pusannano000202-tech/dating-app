export {
  LEGACY_DEV_SCHOOL_PREVIEW_STORAGE_KEY as DEV_SCHOOL_PREVIEW_STORAGE_KEY,
  SCHOOL_THEME_CHANGE_EVENT as DEV_SCHOOL_PREVIEW_CHANGE_EVENT,
  SCHOOL_THEMES as DEV_SCHOOL_PREVIEWS,
  DEFAULT_SCHOOL_THEME_ID as DEFAULT_DEV_SCHOOL_PREVIEW_ID,
  findSchoolTheme as findDevSchoolPreview,
  getDefaultSchoolTheme as getDefaultDevSchoolPreview,
  persistSchoolTheme as persistDevSchoolPreview,
  readStoredSchoolTheme as readStoredDevSchoolPreview,
  resolveSchoolTheme as resolveDevSchoolPreview,
  type SchoolTheme as DevSchoolPreview,
} from '@/lib/school-theme'
