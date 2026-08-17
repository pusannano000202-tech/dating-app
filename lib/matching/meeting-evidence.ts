export const MEETING_EVIDENCE_BUCKET = 'meeting-evidence'
export const MEETING_EVIDENCE_MAX_BYTES = 12 * 1024 * 1024

const CONTENT_TYPE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export type MeetingEvidenceExtension = typeof CONTENT_TYPE_EXTENSIONS[keyof typeof CONTENT_TYPE_EXTENSIONS]

const FILE_SIGNATURES = {
  'image/jpeg': (bytes: Uint8Array) => (
    bytes.length >= 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff
  ),
  'image/png': (bytes: Uint8Array) => (
    bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a
  ),
  'image/webp': (bytes: Uint8Array) => (
    bytes.length >= 12
      && bytes[0] === 0x52
      && bytes[1] === 0x49
      && bytes[2] === 0x46
      && bytes[3] === 0x46
      && bytes[8] === 0x57
      && bytes[9] === 0x45
      && bytes[10] === 0x42
      && bytes[11] === 0x50
  ),
} as const

export function validateMeetingEvidenceFile(input: {
  contentType: string
  byteSize: number
}):
  | { ok: true; extension: MeetingEvidenceExtension }
  | { ok: false; error: 'empty_file' | 'file_too_large' | 'unsupported_file_type' } {
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, error: 'empty_file' }
  }
  if (input.byteSize > MEETING_EVIDENCE_MAX_BYTES) {
    return { ok: false, error: 'file_too_large' }
  }

  const extension = CONTENT_TYPE_EXTENSIONS[input.contentType as keyof typeof CONTENT_TYPE_EXTENSIONS]
  if (!extension) return { ok: false, error: 'unsupported_file_type' }

  return { ok: true, extension }
}

export function validateMeetingEvidenceSignature(
  bytes: Uint8Array,
  contentType: string,
): { ok: true } | { ok: false; error: 'file_signature_mismatch' } {
  const matches = FILE_SIGNATURES[contentType as keyof typeof FILE_SIGNATURES]
  if (!matches || !matches(bytes)) {
    return { ok: false, error: 'file_signature_mismatch' }
  }
  return { ok: true }
}

export function buildMeetingEvidencePath(
  matchId: string,
  evidenceId: string,
  extension: MeetingEvidenceExtension,
): string {
  if (!isSafePathSegment(matchId) || !isSafePathSegment(evidenceId)) {
    throw new Error('invalid_meeting_evidence_path')
  }
  return `${matchId}/${evidenceId}.${extension}`
}

function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value)
}
