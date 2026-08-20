'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import PhotoUpload, { type PhotoUploadResult } from '@/components/profile/PhotoUpload'
import { createClient } from '@/lib/supabase'
import { isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { isSupabaseConfigured } from '@/lib/utils'

export default function PhotosPage() {
  const router = useRouter()
  const [existingPhotos, setExistingPhotos] = useState<string[]>([])
  const [photosLoaded, setPhotosLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) { setPhotosLoaded(true); return }

    let cancelled = false
    async function loadExistingPhotos() {
      try {
        const response = await fetch('/api/profile/photos', {
          method: 'GET',
          cache: 'no-store',
        })
        if (!response.ok) {
          if (response.status !== 401 && !cancelled) {
            setError('기존 사진을 불러오지 못했어요. 다시 시도해줘.')
          }
          return
        }

        const payload: unknown = await response.json()
        if (!isSignedPhotoResponse(payload)) throw new Error('invalid_photo_response')
        if (!cancelled) setExistingPhotos(payload.photos)
      } catch {
        if (!cancelled) setError('기존 사진을 불러오지 못했어요. 다시 시도해줘.')
      } finally {
        if (!cancelled) setPhotosLoaded(true)
      }
    }

    void loadExistingPhotos()
    return () => { cancelled = true }
  }, [])

  async function handleComplete({ publicUrls: localPreviews }: PhotoUploadResult) {
    setSaving(true)
    setError(null)

    try {
      if (isDevAuthBypassEnabled()) {
        router.push('/profile/complete')
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      if (isSupabaseConfigured()) {
        const formData = new FormData()
        await Promise.all(localPreviews.map(async (previewUrl, index) => {
          const response = await fetch(previewUrl)
          if (!response.ok) throw new Error('photo_preview_unavailable')
          const blob = await response.blob()
          const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
          formData.append('photos', blob, `profile-${index + 1}.${extension}`)
        }))

        const uploadResponse = await fetch('/api/profile/photos', {
          method: 'PUT',
          body: formData,
        })
        if (!uploadResponse.ok) throw new Error('photo_upload_failed')

        router.push('/profile/complete')
        return
      }

      router.push('/profile/complete')
    } catch (err) {
      setError('사진 업로드 중 오류가 발생했어요. 다시 시도해줘.')
      setSaving(false)
    }
  }

  async function handleKeepExistingPhotos() {
    if (saving) return
    setSaving(true)
    setError(null)

    try {
      if (isDevAuthBypassEnabled()) {
        router.push('/profile/complete')
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const completeResponse = await fetch('/api/profile/photos', { method: 'POST' })
      if (!completeResponse.ok) throw new Error('profile_completion_failed')
      router.push('/profile/complete')
    } catch (err) {
      setError('사진 저장 상태를 확인하지 못했어요. 다시 시도해줘.')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-28">
      <div className="mb-7">
        <h1 className="text-2xl font-black gradient-fate-text">사진 등록</h1>
        <p className="text-sm text-gray-500 mt-1">
          얼굴이 잘 보이는 사진을 저장해 주세요. 분석은 매칭 찾기를 시작할 때만 진행해요.
        </p>
      </div>

      {/* 기존 사진 로딩 스켈레톤 */}
      {!photosLoaded && (
        <div className="glass rounded-2xl p-4 mb-5 animate-pulse">
          <div className="h-3 w-24 bg-white/10 rounded mb-3" />
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => <div key={i} className="w-16 h-20 bg-white/5 rounded-xl" />)}
          </div>
        </div>
      )}

      {/* 기존 사진이 있는 경우 유지 옵션 표시 */}
      {photosLoaded && existingPhotos.length > 0 && (
        <div className="glass rounded-2xl p-4 mb-5 border border-violet-500/20">
          <p className="text-xs text-violet-300 font-medium mb-3">기존 등록 사진</p>
          <div className="flex gap-2 mb-3">
            {existingPhotos.map((url, i) => (
              <div key={i} className="relative w-16 h-20 rounded-xl overflow-hidden flex-shrink-0">
                <Image src={url} alt={`기존 사진 ${i + 1}`} fill className="object-cover" sizes="64px" />
              </div>
            ))}
          </div>
          <button
            onClick={handleKeepExistingPhotos}
            disabled={saving}
            className="glass w-full py-2.5 rounded-xl text-sm text-gray-300 hover:text-white border border-white/10 transition-colors"
          >
            기존 사진 유지하고 다음으로 →
          </button>
        </div>
      )}

      <PhotoUpload onComplete={handleComplete} saving={saving} />

      {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}

function isSignedPhotoResponse(value: unknown): value is { photos: string[] } {
  if (typeof value !== 'object' || value === null || !('photos' in value)) return false
  const photos = (value as { photos?: unknown }).photos
  return Array.isArray(photos) && photos.length <= 3 && photos.every((url) => typeof url === 'string')
}
