'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import PhotoUpload, { type PhotoUploadResult } from '@/components/profile/PhotoUpload'
import { createClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/utils'

const STORAGE_BUCKET = 'photos'

export default function PhotosPage() {
  const router = useRouter()
  const [existingPhotos, setExistingPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const isConfigured = isSupabaseConfigured()
    if (!isConfigured) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('photos')
        .select('public_url')
        .eq('user_id', user.id)
        .order('sort_order')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setExistingPhotos(data.map((p) => p.public_url as string))
          }
        })
    })
  }, [])

  async function handleComplete({ publicUrls: localPreviews }: PhotoUploadResult) {
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const isConfigured = Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')
      )

      let uploadedUrls: string[] = localPreviews

      if (isConfigured) {
        // 실제 Supabase Storage 업로드
        const uploads = await Promise.all(
          localPreviews.map(async (previewUrl, idx) => {
            const res = await fetch(previewUrl)
            const blob = await res.blob()
            const ext = blob.type.split('/')[1] ?? 'jpg'
            const storagePath = `${user.id}/photo_${idx}.${ext}`

            const { error: upErr } = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(storagePath, blob, { upsert: true, contentType: blob.type })
            if (upErr) throw upErr

            const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
            return { publicUrl: data.publicUrl, storagePath }
          })
        )

        // 기존 레코드 삭제 후 새 레코드 insert (Storage는 upsert라 파일 손실 없음)
        await supabase.from('photos').delete().eq('user_id', user.id)
        const { error: insertErr } = await supabase.from('photos').insert(
          uploads.map(({ publicUrl, storagePath }, idx) => ({
            user_id: user.id,
            storage_path: storagePath,
            public_url: publicUrl,
            sort_order: idx,
          }))
        )
        if (insertErr) throw insertErr

        uploadedUrls = uploads.map(({ publicUrl }) => publicUrl)

        // AI 점수 계산 요청 (fire-and-forget — 실패해도 진행, 서버 프록시 경유)
        fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_urls: uploadedUrls }),
        }).catch(() => {})
      }

      router.push('/profile/survey')
    } catch {
      setError('사진 업로드 중 오류가 발생했어요. 다시 시도해줘.')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black">사진 등록</h1>
        <p className="text-sm text-gray-500 mt-1">AI가 사진으로 외모를 분석해. 얼굴이 잘 보이는 사진으로 올려줘.</p>
      </div>

      {/* 기존 사진이 있는 경우 유지 옵션 표시 */}
      {existingPhotos.length > 0 && (
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
            onClick={() => router.push('/profile/survey')}
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
