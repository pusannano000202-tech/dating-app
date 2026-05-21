'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Check, Loader2, Users } from 'lucide-react'

type InviteState = 'loading' | 'ready' | 'accepting' | 'accepted' | 'error' | 'unauthorized'

interface InviteDetails {
  invite_id: string
  group_id: string
  group_name: string | null
  group_size: number
  group_status: string
  invite_status: string
  expires_at: string
}

export default function GroupInvitePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params.token
  const [state, setState] = useState<InviteState>('loading')
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadInvite() {
      try {
        const res = await fetch(`/api/group-invites?token=${encodeURIComponent(token)}`)
        if (cancelled) return

        if (res.status === 401) {
          setState('unauthorized')
          return
        }

        if (!res.ok) {
          setState('error')
          setError('초대 링크를 확인할 수 없어요.')
          return
        }

        const data = await res.json() as { invite: InviteDetails }
        setInvite(data.invite)
        setState('ready')
      } catch {
        if (!cancelled) {
          setState('error')
          setError('초대 링크를 확인할 수 없어요.')
        }
      }
    }

    loadInvite()
    return () => {
      cancelled = true
    }
  }, [token])

  async function acceptInvite() {
    if (state === 'accepting') return
    setState('accepting')
    setError(null)

    try {
      const res = await fetch('/api/group-invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (!res.ok) {
        setState('error')
        setError('초대 수락에 실패했어요. 이미 만료되었거나 그룹이 가득 찼을 수 있어요.')
        return
      }

      setState('accepted')
      window.setTimeout(() => router.push('/group/create'), 700)
    } catch {
      setState('error')
      setError('초대 수락에 실패했어요.')
    }
  }

  return (
    <main className="min-h-screen px-5 pb-10 flex items-center">
      <div className="w-full max-w-md mx-auto">
        <div className="mb-6 h-14 w-14 rounded-2xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center">
          <Users size={24} className="text-violet-200" />
        </div>

        <h1 className="text-2xl font-black">그룹 초대</h1>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          친구가 함께 매칭을 받을 그룹으로 초대했어요.
        </p>

        <section className="mt-6 glass rounded-3xl p-5">
          {state === 'loading' && (
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              초대 정보를 확인하는 중
            </div>
          )}

          {state === 'unauthorized' && (
            <div>
              <p className="text-sm text-gray-300">로그인 후 초대를 수락할 수 있어요.</p>
              <Link href="/login" className="btn-gradient mt-4 block w-full rounded-2xl py-3 text-center text-sm font-bold">
                로그인하기
              </Link>
            </div>
          )}

          {state === 'ready' && invite && (
            <div>
              <p className="text-xs text-gray-500">초대 그룹</p>
              <p className="mt-1 text-lg font-black">{invite.group_name ?? '내 운명 그룹'}</p>
              <p className="mt-1 text-xs text-gray-500">{invite.group_size}명 그룹 · {invite.group_status}</p>
              <button
                type="button"
                onClick={acceptInvite}
                className="btn-gradient mt-5 w-full rounded-2xl py-3 text-sm font-bold"
              >
                초대 수락하기
              </button>
            </div>
          )}

          {state === 'accepting' && (
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              그룹에 참여하는 중
            </div>
          )}

          {state === 'accepted' && (
            <div className="flex items-center gap-3 text-sm text-emerald-300">
              <Check size={18} />
              그룹에 참여했어요.
            </div>
          )}

          {state === 'error' && (
            <div>
              <p className="text-sm text-red-300">{error ?? '초대 처리 중 오류가 발생했어요.'}</p>
              <Link href="/group/create" className="mt-4 block w-full rounded-2xl border border-white/10 py-3 text-center text-sm text-gray-300">
                내 그룹으로 돌아가기
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
