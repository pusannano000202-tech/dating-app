const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u

export function parseFriendRecognitionName(value: unknown): string | null {
  if (typeof value !== 'string' || FORBIDDEN.test(value)) return null
  const normalized = value.replace(/[ \t]+/g, ' ').trim().normalize('NFC')
  const length = [...normalized].length
  return length >= 2 && length <= 40 ? normalized : null
}
