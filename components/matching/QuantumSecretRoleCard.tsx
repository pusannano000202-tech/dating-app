'use client'

import { CheckCircle2, Eye, LockKeyhole, RefreshCw, RotateCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
  parseMySecretRole,
  type QuantumMySecretRole,
} from '@/lib/matching/quantum-secret-roles'

export type QuantumSecretRoleRequestClient = {
  loadRole: (occurrenceId: string) => Promise<QuantumMySecretRole | null>
  changeRole: (occurrenceId: string) => Promise<QuantumMySecretRole | null>
  confirmRole: (occurrenceId: string) => Promise<QuantumMySecretRole | null>
}

export type QuantumSecretRoleCardProps = {
  occurrenceId: string
  initialRole?: QuantumMySecretRole | null
  requestClient?: QuantumSecretRoleRequestClient
  onRoleChanged?: (role: QuantumMySecretRole) => void
  onRoleConfirmed?: (role: QuantumMySecretRole) => void
}

type RoleLoadState = 'loading' | 'ready' | 'empty' | 'error'

const defaultRequestClient: QuantumSecretRoleRequestClient = {
  async loadRole(occurrenceId) {
    const response = await fetch(
      `/api/match/event-secret-role?occurrence_id=${encodeURIComponent(occurrenceId)}`,
      { cache: 'no-store' },
    )
    return parseRoleResponse(response)
  },
  async changeRole(occurrenceId) {
    const response = await fetch('/api/match/event-secret-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurrence_id: occurrenceId }),
      cache: 'no-store',
    })
    return parseRoleResponse(response)
  },
  async confirmRole(occurrenceId) {
    const response = await fetch('/api/match/event-secret-role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurrence_id: occurrenceId }),
      cache: 'no-store',
    })
    return parseRoleResponse(response)
  },
}

export default function QuantumSecretRoleCard({
  occurrenceId,
  initialRole,
  requestClient = defaultRequestClient,
  onRoleChanged,
  onRoleConfirmed,
}: QuantumSecretRoleCardProps) {
  const [loadState, setLoadState] = useState<RoleLoadState>('loading')
  const [role, setRole] = useState<QuantumMySecretRole | null>(null)
  const [opened, setOpened] = useState(false)
  const [changing, setChanging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')

  const applyRole = useCallback((nextRole: QuantumMySecretRole | null, successNotice = '') => {
    if (!nextRole) {
      setRole(null)
      setLoadState('empty')
      return false
    }

    if (nextRole.occurrenceId !== occurrenceId) {
      setRole(null)
      setLoadState('error')
      setNotice('현재 약속의 역할을 확인하지 못했어요. 다시 확인해 주세요.')
      return false
    }

    setRole(nextRole)
    setLoadState('ready')
    if (successNotice) setNotice(successNotice)
    return true
  }, [occurrenceId])

  const loadRole = useCallback(async () => {
    setLoadState('loading')
    setNotice('')

    try {
      applyRole(await requestClient.loadRole(occurrenceId))
    } catch {
      setRole(null)
      setLoadState('error')
      setNotice('역할을 불러오지 못했어요. 다시 확인해 주세요.')
    }
  }, [applyRole, occurrenceId, requestClient])

  useEffect(() => {
    if (initialRole === undefined) {
      void loadRole()
      return
    }

    applyRole(initialRole)
  }, [applyRole, initialRole, loadRole])

  async function changeRole() {
    if (!role?.canChange || changing || confirming) return

    setChanging(true)
    setNotice('')
    try {
      const changedRole = await requestClient.changeRole(occurrenceId)
      if (changedRole && applyRole(changedRole, '역할을 한 번 바꿨어요. 새 봉인을 열어 확인해 주세요.')) {
        setOpened(false)
        onRoleChanged?.(changedRole)
      }
    } catch {
      setNotice('역할을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setChanging(false)
    }
  }

  async function confirmRole() {
    if (!role || role.roleConfirmed || changing || confirming) return

    setConfirming(true)
    setNotice('')
    try {
      const confirmedRole = await requestClient.confirmRole(occurrenceId)
      if (!confirmedRole?.roleConfirmed || !confirmedRole.applicationConfirmed) {
        setNotice('역할 확인 결과를 확인하지 못했어요. 참여는 아직 확정하지 않았어요.')
        return
      }
      if (applyRole(confirmedRole, '역할을 확인했고 참여가 확정됐어요.')) {
        onRoleConfirmed?.(confirmedRole)
      }
    } catch {
      setNotice('역할 확인을 저장하지 못했어요. 참여는 아직 확정하지 않았어요.')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <section
      aria-labelledby="secret-role-title"
      aria-busy={loadState === 'loading' || changing || confirming}
      className="overflow-hidden rounded-lg border border-[#38414A] bg-[#12191F] text-[#FFF8F2] shadow-[0_18px_40px_rgba(31,25,23,0.18)]"
    >
      <div className="border-b border-[#3B4651] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-[#E9BE6A]">행사 전용 비밀 미션</p>
            <h2 id="secret-role-title" className="mt-1 text-lg font-black">나만 볼 수 있는 역할</h2>
          </div>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#7F6740] bg-[#201B15] px-2.5 text-xs font-black text-[#F4D68D]">
            <LockKeyhole size={15} aria-hidden="true" /> 봉인됨
          </span>
        </div>
      </div>

      <div className="px-5 py-5">
        {loadState === 'loading' ? (
          <div className="flex min-h-28 items-center gap-3 text-sm font-bold text-[#D4D0C8]">
            <RefreshCw size={19} className="animate-spin text-[#E9BE6A]" aria-hidden="true" />
            내 역할을 확인하고 있어요.
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="border-l-2 border-[#E9BE6A] bg-[#1B242C] px-4 py-4">
            <p className="text-sm font-black text-white">역할을 열지 못했어요.</p>
            <button
              type="button"
              onClick={() => void loadRole()}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#7F6740] px-3 text-sm font-black text-[#F4D68D]"
            >
              <RefreshCw size={16} aria-hidden="true" /> 다시 확인
            </button>
          </div>
        ) : null}

        {loadState === 'empty' ? (
          <div className="border-l-2 border-[#E9BE6A] bg-[#1B242C] px-4 py-4">
            <p className="text-sm font-black text-white">아직 역할이 준비되지 않았어요.</p>
            <p className="mt-1 text-xs font-bold leading-5 text-[#D4D0C8]">방 편성이 끝난 뒤에 다시 확인해 주세요.</p>
            <button
              type="button"
              onClick={() => void loadRole()}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#7F6740] px-3 text-sm font-black text-[#F4D68D]"
            >
              <RefreshCw size={16} aria-hidden="true" /> 다시 확인
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && role && !opened ? (
          <div className="border border-dashed border-[#8F794C] bg-[#1A2026] px-4 py-5 text-center">
            <LockKeyhole size={28} className="mx-auto text-[#E9BE6A]" aria-hidden="true" />
            <p className="mt-3 text-base font-black text-white">오늘의 역할은 만남이 끝날 때까지 비밀이에요.</p>
            <p className="mt-2 text-xs font-bold leading-5 text-[#D4D0C8]">다른 참가자에게는 역할과 미션이 보이지 않아요.</p>
            <button
              type="button"
              onClick={() => setOpened(true)}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#E9BE6A] px-4 text-sm font-black text-[#24201A]"
            >
              <Eye size={17} aria-hidden="true" /> 역할 봉인 열기
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && role && opened ? (
          <div className="border border-[#7F6740] bg-[#1A2026] px-4 py-4">
            <p className="text-xs font-black text-[#E9BE6A]">내 역할</p>
            <h3 className="mt-1 text-2xl font-black text-white">{role.label}</h3>
            <p className="mt-4 border-l-2 border-[#E9BE6A] pl-3 text-sm font-bold leading-6 text-[#FFF8F2]">{role.mission}</p>
            <div className="mt-4 flex items-start gap-2 border-t border-[#3B4651] pt-4 text-xs font-bold leading-5 text-[#D4D0C8]">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#E9BE6A]" aria-hidden="true" />
              <p>{role.safetyCopy}</p>
            </div>

            {!role.roleConfirmed && role.canChange ? (
              <button
                type="button"
                disabled={changing || confirming}
                onClick={() => void changeRole()}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#E9BE6A] px-4 text-sm font-black text-[#F4D68D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {changing ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <RotateCw size={17} aria-hidden="true" />}
                {changing ? '역할을 바꾸고 있어요' : '한 번 바꾸기'}
              </button>
            ) : null}

            {!role.roleConfirmed ? (
              <button
                type="button"
                disabled={changing || confirming}
                onClick={() => void confirmRole()}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#E9BE6A] px-4 text-sm font-black text-[#24201A] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirming ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
                {confirming ? '참여를 확정하고 있어요' : '역할 확인하고 참여 확정'}
              </button>
            ) : (
              <p className="mt-4 flex items-center gap-2 border-t border-[#3B4651] pt-4 text-sm font-black text-[#F4D68D]">
                <CheckCircle2 size={17} aria-hidden="true" /> 참여 확정 완료
              </p>
            )}
          </div>
        ) : null}

        {notice ? <p className="mt-4 text-xs font-black leading-5 text-[#F4D68D]" role="status" aria-live="polite">{notice}</p> : null}
      </div>
    </section>
  )
}

async function parseRoleResponse(response: Response): Promise<QuantumMySecretRole | null> {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) throw new Error('secret_role_request_failed')
  return payload ? parseMySecretRole(payload.secret_role) : null
}
