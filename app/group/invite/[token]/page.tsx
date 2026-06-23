'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Check, Loader2, ShieldCheck, Users } from 'lucide-react'

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

        if (!res.ok) {
          setState('error')
          setError('초대 링크를 확인할 수 없어요.')
          return
        }

        const data = await res.json() as { invite: InviteDetails; authenticated: boolean }
        setInvite(data.invite)
        setState(data.authenticated ? 'ready' : 'unauthorized')
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
    <main className="min-h-screen booting-band px-5 py-8 text-boot-ink">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-boot-primary/20 bg-boot-soft text-boot-primary shadow-sm">
          <Users size={24} />
        </div>

        <p className="text-xs font-black uppercase tracking-normal text-boot-primary">Group Invite</p>
        <h1 className="mt-1 text-3xl font-black leading-tight">친구가 그룹에 초대했어요</h1>
        <p className="mt-3 break-keep text-sm leading-6 text-boot-muted">
          로그인/회원가입을 먼저 마치고 초대를 수락하면, 같은 그룹에서 매칭 준비를 이어갈 수 있어요.
        </p>

        <section className="glass-card mt-6 rounded-3xl border border-boot-hairline bg-white/95 p-5 shadow-sm">
          {state === 'loading' && (
            <div className="flex items-center gap-3 text-sm font-bold text-boot-muted">
              <Loader2 size={18} className="animate-spin" />
              초대 정보를 확인하는 중
            </div>
          )}

          {state === 'unauthorized' && invite && (
            <div>
              <p className="text-xs font-black text-boot-primary">초대 그룹</p>
              <p className="mt-1 text-xl font-black">{invite.group_name ?? '부팅 그룹'}</p>
              <p className="mt-1 text-xs font-bold text-boot-muted">{invite.group_size}명 그룹 · 수락 대기</p>
              <div className="mt-4 rounded-2xl border border-boot-hairline bg-boot-soft/55 px-3 py-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-boot-primary" />
                  <p className="text-xs leading-5 text-boot-muted">
                    초대 링크만으로 바로 그룹에 들어가지 않아요. 본인 계정으로 로그인한 뒤 수락해야 참여가 완료됩니다.
                  </p>
                </div>
              </div>
              <Link
                href={`/login?next=${encodeURIComponent(`/group/invite/${token}`)}`}
                className="btn-gradient mt-4 block w-full rounded-2xl py-3.5 text-center text-sm font-black"
              >
                로그인/회원가입하고 수락하기
              </Link>
            </div>
          )}

          {state === 'unauthorized' && !invite && (
            <div>
              <p className="text-sm font-bold text-boot-muted">로그인/회원가입 후 초대를 수락할 수 있어요.</p>
              <Link href="/login" className="btn-gradient mt-4 block w-full rounded-2xl py-3.5 text-center text-sm font-black">
                로그인/회원가입하기
              </Link>
            </div>
          )}

          {state === 'ready' && invite && (
            <div>
              <p className="text-xs font-black text-boot-primary">초대 그룹</p>
              <p className="mt-1 text-xl font-black">{invite.group_name ?? '부팅 그룹'}</p>
              <p className="mt-1 text-xs font-bold text-boot-muted">{invite.group_size}명 그룹 · 수락 대기</p>
              <button
                type="button"
                onClick={acceptInvite}
                className="btn-gradient mt-5 w-full rounded-2xl py-3.5 text-sm font-black"
              >
                초대 수락하기
              </button>
            </div>
          )}

          {state === 'accepting' && (
            <div className="flex items-center gap-3 text-sm font-bold text-boot-muted">
              <Loader2 size={18} className="animate-spin" />
              그룹에 참여하는 중
            </div>
          )}

          {state === 'accepted' && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-black text-emerald-700">
              <Check size={18} />
              그룹에 참여했어요.
            </div>
          )}

          {state === 'error' && (
            <div>
              <p className="text-sm font-bold text-red-500">{error ?? '초대 처리 중 오류가 발생했어요.'}</p>
              <Link href="/group/create" className="mt-4 block w-full rounded-2xl border border-boot-hairline bg-white py-3 text-center text-sm font-bold text-boot-body">
                내 그룹으로 돌아가기
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
