'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ACCOUNT_DELETION_CONFIRMATION } from '@/lib/account/deletion-contract'
import { createClient } from '@/lib/supabase'

type SubmitState = 'idle' | 'submitting' | 'accepted' | 'reauth' | 'error'

export default function AccountDeletionForm() {
  const [confirmation, setConfirmation] = useState('')
  const [state, setState] = useState<SubmitState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  async function submit() {
    if (confirmation !== ACCOUNT_DELETION_CONFIRMATION || state === 'submitting') return
    setState('submitting')
    setMessage(null)
    try {
      const response = await fetch('/api/account/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation, idempotencyKey }),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (response.status === 403 && payload?.error === 'reauthentication_required') {
        setState('reauth')
        return
      }
      if (!response.ok) throw new Error(payload?.error ?? 'request_failed')
      // The server revokes global refresh sessions after recording the denial.
      // Clear this browser's local cookie/session copy even if it was already revoked.
      await createClient().auth.signOut({ scope: 'local' }).catch(() => null)
      setState('accepted')
    } catch {
      setState('error')
      setMessage('탈퇴 요청을 저장하지 못했어요. 계정이 삭제된 것처럼 표시하지 않았습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  if (state === 'accepted') {
    return (
      <section className="rounded-2xl border border-[#B9DDD5] bg-[#EAF6F4] p-5" role="status">
        <h2 className="text-lg font-black text-[#0D514A]">탈퇴 요청을 접수했어요</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-[#356D67]">
          친구 이름·메시지·보이스 접근은 즉시 중지됐고, 저장 파일은 삭제 대기열에서 순서대로 처리됩니다.
          법령·결제·분쟁 대응에 필요한 기록은 근거와 기간에 따라 분리 보관될 수 있어요.
        </p>
        <Link href="/login" className="mt-5 inline-flex min-h-11 items-center font-black text-[#147A70]">로그인 화면으로</Link>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[#F1B4AD] bg-white p-5">
      <h2 className="text-lg font-black">삭제 전에 확인해 주세요</h2>
      <ul className="mt-3 space-y-2 text-sm font-bold leading-6 text-boot-muted">
        <li>• 탈퇴 요청 즉시 친구 인식명, 새 메시지, 보이스 세션 접근이 중지돼요.</li>
        <li>• 사진·앨범 파일은 실패 시 재시도되며, 삭제 완료 전에 계정을 삭제하지 않아요.</li>
        <li>• 분쟁·결제·법적 의무로 보관해야 하는 기록은 즉시 삭제 대상에서 제외될 수 있어요.</li>
      </ul>
      <label htmlFor="deletion-confirmation" className="mt-5 block text-sm font-black">
        <span className="block">계속하려면 <strong>{ACCOUNT_DELETION_CONFIRMATION}</strong>를 그대로 입력하세요.</span>
        <input
          id="deletion-confirmation"
          value={confirmation}
          onChange={(event) => { setConfirmation(event.target.value); setState('idle') }}
          autoComplete="off"
          className="mt-2 min-h-12 w-full rounded-xl border border-boot-hairline px-4 outline-none focus:border-[#B44236]"
        />
      </label>
      {state === 'reauth' ? (
        <p className="mt-4 rounded-xl bg-[#FFF5DE] p-3 text-sm font-bold text-[#755000]" role="alert">
          보안을 위해 최근 로그인이 필요해요.{' '}
          <Link href="/login?redirect=%2Faccount%2Fdelete" className="underline">다시 로그인</Link>
        </p>
      ) : null}
      {message ? <p className="mt-4 text-sm font-bold text-[#B44236]" role="alert">{message}</p> : null}
      <button
        type="button"
        disabled={confirmation !== ACCOUNT_DELETION_CONFIRMATION || state === 'submitting'}
        onClick={() => void submit()}
        className="mt-5 min-h-12 w-full rounded-xl bg-[#B44236] px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === 'submitting' ? '탈퇴 요청 저장 중…' : '탈퇴 요청하기'}
      </button>
    </section>
  )
}
