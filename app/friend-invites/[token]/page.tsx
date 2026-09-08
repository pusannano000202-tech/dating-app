'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2, UserRoundCheck, UserRoundX } from 'lucide-react'

type InvitePreview = { inviter_display_name?: string; expires_at?: string; status?: string }

export default function FriendInvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)

  useEffect(() => {
    let active = true
    void fetch(`/api/friend-invites/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        if (response.status === 401) { setNeedsLogin(true); setError('로그인한 뒤 이 초대 주소로 다시 돌아와 주세요.'); return }
        if (!response.ok || !body?.invite) { setError('유효하지 않거나 만료된 초대예요.'); return }
        setInvite(body.invite)
      })
      .catch(() => { if (active) setError('초대를 불러오지 못했어요.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [router, token])

  async function decide(action: 'accept' | 'decline') {
    if (saving) return
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/friend-invites/${encodeURIComponent(token)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) { setError(body?.error === 'invite_expired' ? '초대가 만료됐어요.' : '초대를 처리하지 못했어요.'); return }
      router.replace(action === 'accept' ? '/friends' : '/')
    } catch { setError('연결을 확인한 뒤 다시 시도해 주세요.') }
    finally { setSaving(false) }
  }

  return <main className="min-h-screen booting-paper px-5 py-12 text-boot-ink"><section className="mx-auto max-w-md rounded-3xl border border-boot-hairline bg-white p-6 shadow-sm">
    <p className="text-xs font-black text-boot-primary">Private friend invite</p><h1 className="mt-2 text-2xl font-black">친구 초대</h1>
    {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-boot-primary" /></div>
      : error ? <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}{needsLogin ? <Link href="/login" className="mt-3 block rounded-lg bg-white px-3 py-2 text-center text-boot-primary">로그인하기</Link> : null}</div>
        : <><p className="mt-5 text-sm leading-6"><strong>{invite?.inviter_display_name ?? '친구'}</strong>님이 친구 초대를 보냈어요. 수락한 뒤에만 서로의 친구 인식명과 1:1 대화를 볼 수 있어요.</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={saving} onClick={() => void decide('decline')} className="min-h-12 rounded-xl border border-boot-hairline font-black disabled:opacity-50"><UserRoundX size={17} className="mr-1 inline" />거절</button><button type="button" disabled={saving} onClick={() => void decide('accept')} className="min-h-12 rounded-xl bg-boot-primary font-black text-white disabled:opacity-50">{saving ? <Loader2 size={17} className="mr-1 inline animate-spin" /> : <UserRoundCheck size={17} className="mr-1 inline" />}수락</button></div></>}
    <Link href="/" className="mt-5 block text-center text-xs font-bold text-boot-muted">홈으로</Link>
  </section></main>
}
