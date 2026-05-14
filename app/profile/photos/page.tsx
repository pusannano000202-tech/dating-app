'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PhotoUpload, { type PhotoUploadResult } from '@/components/profile/PhotoUpload'
import { createClient } from '@/lib/supabase'

const AI_SERVER_URL = process.env.NEXT_PUBLIC_AI_SERVER_URL ?? 'http://localhost:8000'
const STORAGE_BUCKET = 'photos'

export default function PhotosPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleComplete({ publicUrls: localPreviews }: PhotoUploadResult) {
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const isConfigured = !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder')

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

        // AI 점수 계산 요청 (fire-and-forget — 실패해도 진행)
        fetch(`${AI_SERVER_URL}/api/score-photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, photo_urls: uploadedUrls }),
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

      <PhotoUpload onComplete={handleComplete} saving={saving} />

      {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}
