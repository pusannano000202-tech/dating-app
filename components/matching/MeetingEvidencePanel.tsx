'use client'

import { Camera, CheckCircle2, Clock3, ImageIcon, Loader2, ShieldCheck, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

type AlbumOperations = {
  starts_at: string
  ends_at: string
  evidence_upload_opens_at: string
  evidence_upload_closes_at: string
  phase: 'scheduled' | 'check_in' | 'in_progress' | 'complete' | 'closed'
  can_upload_evidence: boolean
}

type AlbumPhoto = {
  id: string
  signed_url: string
  submitted_at: string
  captured_at: string | null
  status: string
  mine: boolean
  expires_in: number
}

type AlbumPayload = {
  operations: AlbumOperations
  photos: AlbumPhoto[]
}

const DEV_OPERATIONS: AlbumOperations = {
  starts_at: new Date(Date.now() - 90 * 60_000).toISOString(),
  ends_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  evidence_upload_opens_at: new Date(Date.now() - 110 * 60_000).toISOString(),
  evidence_upload_closes_at: new Date(Date.now() + 23 * 60 * 60_000).toISOString(),
  phase: 'complete',
  can_upload_evidence: true,
}

const DEV_PHOTOS: AlbumPhoto[] = [{
  id: 'dev-meeting-photo',
  signed_url: '/images/match/quantum-tonight-five.webp',
  submitted_at: new Date().toISOString(),
  captured_at: null,
  status: 'submitted',
  mine: true,
  expires_in: 300,
}]

export default function MeetingEvidencePanel({
  matchId,
  devPreview = false,
}: {
  matchId: string
  devPreview?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [album, setAlbum] = useState<AlbumPayload | null>(devPreview
    ? { operations: DEV_OPERATIONS, photos: DEV_PHOTOS }
    : null)
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(!devPreview)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refreshAlbum = useCallback(async () => {
    if (devPreview) return
    setLoading(true)
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/album`, {
        cache: 'no-store',
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok || !isAlbumPayload(payload)) throw new Error('album_unavailable')
      setAlbum(payload)
    } catch {
      setMessage('사진첩을 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [devPreview, matchId])

  useEffect(() => {
    void refreshAlbum()
  }, [refreshAlbum])

  async function uploadSelectedPhoto() {
    if (!selectedPhoto || uploading) return
    setUploading(true)
    setMessage(null)

    if (devPreview) {
      const previewUrl = URL.createObjectURL(selectedPhoto)
      setAlbum((current) => ({
        operations: current?.operations ?? DEV_OPERATIONS,
        photos: [{
          id: `dev-${Date.now()}`,
          signed_url: previewUrl,
          submitted_at: new Date().toISOString(),
          captured_at: null,
          status: 'submitted',
          mine: true,
          expires_in: 300,
        }, ...(current?.photos ?? [])],
      }))
      setSelectedPhoto(null)
      setMessage('미리보기 데이터는 저장되지 않아요.')
      setUploading(false)
      return
    }

    try {
      const formData = new FormData()
      formData.append('photo', selectedPhoto)
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/evidence-photo`, {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'upload_failed')
      setSelectedPhoto(null)
      if (inputRef.current) inputRef.current.value = ''
      setMessage('참가 사진을 저장했어요. 함께 만난 사람들의 사진첩에도 표시돼요.')
      await refreshAlbum()
    } catch (error) {
      setMessage(translateUploadError(error instanceof Error ? error.message : 'upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  const canUpload = album?.operations.can_upload_evidence ?? false

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-boot-primary/20 bg-white shadow-sm">
      <div className="bg-boot-ink px-4 py-4 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-amber-300">MEETING ALBUM</p>
            <h3 className="mt-1 text-lg font-black">오늘의 사진을 함께 남겨요</h3>
            <p className="mt-1 text-xs leading-5 text-white/70">
              참가 확인과 참가자 앨범에 함께 저장돼요.
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Camera size={19} />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex min-h-12 items-center gap-2 rounded-lg bg-boot-soft px-3 py-2">
            <Clock3 size={15} className="text-boot-primary" />
            <span className="font-bold text-boot-body">
              {canUpload ? '지금 사진을 올릴 수 있어요' : '사진 등록 시간을 기다려요'}
            </span>
          </div>
          <div className="flex min-h-12 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
            <ShieldCheck size={15} className="text-emerald-700" />
            <span className="font-bold text-emerald-800">참가자만 볼 수 있어요</span>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-boot-muted">
            <Loader2 size={17} className="animate-spin" />
            사진첩을 불러오는 중
          </div>
        ) : album?.photos.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {album.photos.map((photo) => (
              <figure key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-boot-soft">
                {/* Short-lived private signed URLs are intentionally rendered without optimization caching. */}
                <img src={photo.signed_url} alt="함께 남긴 만남 사진" className="h-full w-full object-cover" />
                {photo.mine ? (
                  <figcaption className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
                    <CheckCircle2 size={11} /> 내가 올림
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-boot-hairline bg-boot-soft/50 px-4 text-center">
            <ImageIcon size={22} className="text-boot-primary" />
            <p className="mt-2 text-sm font-black text-boot-ink">아직 함께 남긴 사진이 없어요</p>
            <p className="mt-1 text-xs text-boot-muted">첫 사진을 올리면 참가자 앨범이 시작돼요.</p>
          </div>
        )}

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => setSelectedPhoto(event.target.files?.[0] ?? null)}
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              disabled={!canUpload || uploading}
              onClick={() => inputRef.current?.click()}
              className="min-h-12 rounded-lg border border-boot-primary/30 bg-white px-3 text-sm font-black text-boot-primary disabled:opacity-40"
            >
              {selectedPhoto ? selectedPhoto.name : '사진 고르기'}
            </button>
            <button
              type="button"
              disabled={!canUpload || !selectedPhoto || uploading}
              onClick={() => void uploadSelectedPhoto()}
              className="flex min-h-12 min-w-24 items-center justify-center gap-2 rounded-lg bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-40"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              올리기
            </button>
          </div>
          <p className="text-[11px] leading-5 text-boot-muted">
            사진 한 장만으로 보증금 제재를 결정하지 않아요. 신고가 필요한 경우 별도 안전 절차와 함께 확인해요.
          </p>
          {message ? <p role="status" className="text-xs font-bold text-boot-primary">{message}</p> : null}
        </div>
      </div>
    </section>
  )
}

function isAlbumPayload(value: unknown): value is AlbumPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payload = value as Record<string, unknown>
  if (!payload.operations || typeof payload.operations !== 'object' || !Array.isArray(payload.photos)) return false
  return payload.photos.every((photo) => {
    if (!photo || typeof photo !== 'object' || Array.isArray(photo)) return false
    const item = photo as Record<string, unknown>
    return typeof item.id === 'string' && typeof item.signed_url === 'string'
  })
}

function translateUploadError(code: string) {
  switch (code) {
    case 'evidence_window_closed': return '사진 등록 시간이 아니에요. 만남 직전부터 종료 다음 날까지 올릴 수 있어요.'
    case 'not_match_participant': return '이 만남에 참여한 사용자만 사진을 올릴 수 있어요.'
    case 'file_too_large': return '사진은 12MB 이하로 올려 주세요.'
    case 'unsupported_file_type': return 'JPG, PNG, WEBP 사진만 올릴 수 있어요.'
    case 'file_signature_mismatch': return '올바른 이미지 파일인지 확인해 주세요.'
    case 'evidence_already_submitted': return '이미 이 만남의 사진을 올렸어요. 참가자 앨범에서 확인해 주세요.'
    case 'schema_unavailable': return '사진 저장 준비가 아직 끝나지 않았어요. 잠시 뒤 다시 시도해 주세요.'
    default: return '사진을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  }
}
