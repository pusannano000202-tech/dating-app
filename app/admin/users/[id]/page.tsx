'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Loader2, RotateCcw } from 'lucide-react'

interface AdminProfile {
  user_id: string
  display_name: string | null
  gender: string | null
  age: number | null
  school: string | null
  department: string | null
  appearance_type: string | null
  is_profile_complete: boolean
  effective_score: number | null
  score_auto: number | null
  score_override: number | null
  score_source: string | null
  score_updated_at: string | null
  appearance_score_normalized: number | null
  photo_urls: string[]
}

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scoreInput, setScoreInput] = useState('')
  const [reason, setReason] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`)
      if (!res.ok) { setError('프로필을 불러오지 못했어요.'); return }
      const d = await res.json() as { profile: AdminProfile | null }
      setProfile(d.profile)
      setScoreInput(d.profile?.effective_score != null ? String(Math.round(d.profile.effective_score)) : '')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function saveOverride() {
    const score = Number(scoreInput)
    if (busy || Number.isNaN(score) || score < 0 || score > 100) { setError('0~100 점수를 입력하세요.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/appearance-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, reason: reason || null }),
      })
      if (res.ok) { setReason(''); await refresh() }
      else setError('보정에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  async function clearOverride() {
    if (busy || !confirm('보정을 해제하고 자동 점수로 되돌릴까요?')) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/appearance-override`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null }),
      })
      if (res.ok) { setReason(''); await refresh() }
      else setError('해제에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="px-5 pb-10">
      <div className="max-w-3xl mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <button onClick={() => history.back()} className="p-2 glass rounded-xl"><ChevronLeft size={18} /></button>
          <h1 className="text-xl font-black">프로필 · 점수 보정</h1>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중
          </section>
        ) : profile ? (
          <>
            <section className="glass-card rounded-3xl p-5 mb-4 border border-white/[0.06]">
              <p className="text-base font-black">
                {profile.display_name ?? '이름없음'} · {profile.age ?? '?'}세 · {profile.gender === 'male' ? '남' : profile.gender === 'female' ? '여' : '?'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{profile.school ?? ''} {profile.department ?? ''}</p>

              {profile.photo_urls?.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {profile.photo_urls.map((url) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img key={url} src={url} alt="" className="aspect-square w-full object-cover rounded-xl bg-white/[0.05]" />
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-gray-600">업로드된 사진 없음</p>
              )}
            </section>

            <section className="glass-card rounded-3xl p-5 mb-4 border border-white/[0.06]">
              <p className="text-sm font-bold mb-3">외모 점수 (0~100)</p>
              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <ScoreCell label="GPT 자동" value={profile.score_auto} />
                <ScoreCell label="운영자 보정" value={profile.score_override} />
                <ScoreCell label="적용값" value={profile.effective_score} highlight />
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                현재 출처: <span className="text-gray-300">{profile.score_source ?? '미설정'}</span>
                {profile.score_updated_at && ` · ${new Date(profile.score_updated_at).toLocaleString('ko-KR')}`}
              </p>

              <label className="block text-xs text-gray-400 mb-1">보정 점수</label>
              <input
                type="number" min={0} max={100} value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                className="w-full rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2 text-sm mb-3"
                placeholder="0~100"
              />
              <label className="block text-xs text-gray-400 mb-1">사유 (선택)</label>
              <input
                type="text" value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2 text-sm mb-4"
                placeholder="예: GPT 과소평가 보정"
              />

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={saveOverride} disabled={busy}
                  className="btn-gradient py-2.5 rounded-2xl text-sm font-bold disabled:opacity-40">
                  보정 적용
                </button>
                <button type="button" onClick={clearOverride} disabled={busy || profile.score_override == null}
                  className="py-2.5 rounded-2xl text-sm font-bold border border-white/15 text-gray-300 hover:border-white/30 flex items-center justify-center gap-1.5 disabled:opacity-30">
                  <RotateCcw size={15} /> 보정 해제
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="glass rounded-3xl p-6 text-center text-sm text-gray-400">프로필을 찾을 수 없어요.</section>
        )}
      </div>
    </main>
  )
}

function ScoreCell({ label, value, highlight }: { label: string; value: number | null; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl px-2 py-3 ${highlight ? 'glass-rose' : 'bg-white/[0.04]'}`}>
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className={`text-xl font-black ${highlight ? 'gradient-fate-text' : ''}`}>
        {value != null ? Math.round(value) : '–'}
      </p>
    </div>
  )
}
