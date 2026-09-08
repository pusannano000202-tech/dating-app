'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

const ACCOUNT_DELETION_STATUSES = [
  'requested',
  'cleanup_pending',
  'retry_wait',
  'auth_delete_pending',
  'completed',
  'cancelled',
] as const

export type AccountDeletionRequestStatus = typeof ACCOUNT_DELETION_STATUSES[number]

export type AccountDeletionStatusState =
  | { kind: 'loading' }
  | { kind: 'unrequested' }
  | { kind: 'unauthenticated' }
  | { kind: 'error' }
  | {
      kind: 'request'
      status: AccountDeletionRequestStatus
      requestedAt: string
    }

type StatusPresentation = {
  title: string
  statusLabel: string
  body: string
  processing: boolean
}

const STATUS_PRESENTATIONS: Record<AccountDeletionRequestStatus, StatusPresentation> = {
  requested: {
    title: '탈퇴 요청이 접수됐어요',
    statusLabel: '접수됨',
    body: '요청은 안전하게 기록됐어요. 운영 자동 삭제가 활성화된 환경에서 순서대로 진행되고, 실패한 작업은 자동으로 다시 시도해요.',
    processing: true,
  },
  cleanup_pending: {
    title: '계정 자료 정리를 기다리고 있어요',
    statusLabel: '파일 정리 대기',
    body: '사진과 앨범 등 삭제 대상이 대기열에 있어요. 운영 자동 삭제가 활성화된 환경에서 실패한 작업은 자동으로 다시 시도해요.',
    processing: true,
  },
  retry_wait: {
    title: '삭제 작업을 다시 준비하고 있어요',
    statusLabel: '자동 재시도 대기',
    body: '일시적으로 끝내지 못한 작업을 기록해 두었어요. 운영 자동 삭제가 활성화된 환경에서 자동으로 다시 시도하므로 잠시 뒤 상태를 새로고침해 주세요.',
    processing: true,
  },
  auth_delete_pending: {
    title: '계정 삭제를 마무리하고 있어요',
    statusLabel: '계정 삭제 대기',
    body: '저장 자료 정리 뒤 로그인 계정 삭제를 기다리는 단계예요. 운영 자동 삭제가 활성화된 환경에서 실패한 작업은 자동으로 다시 시도해요.',
    processing: true,
  },
  completed: {
    title: '계정 삭제가 완료됐어요',
    statusLabel: '삭제 완료',
    body: '계정과 정리 대상 파일의 삭제 처리가 완료됐어요.',
    processing: false,
  },
  cancelled: {
    title: '탈퇴 요청이 종료됐어요',
    statusLabel: '요청 종료',
    body: '이 요청은 더 이상 처리 중이 아니에요. 새 요청이 필요하면 회원탈퇴 화면에서 다시 접수해 주세요.',
    processing: false,
  },
}

export function parseAccountDeletionStatusPayload(
  httpStatus: number,
  payload: unknown,
): Exclude<AccountDeletionStatusState, { kind: 'loading' }> {
  if (httpStatus === 401) return { kind: 'unauthenticated' }
  if (httpStatus < 200 || httpStatus >= 300 || !isRecord(payload)) return { kind: 'error' }

  const request = payload.request
  if (request === null) return { kind: 'unrequested' }
  if (!isRecord(request) || !isAccountDeletionRequestStatus(request.status)) return { kind: 'error' }
  if (typeof request.requested_at !== 'string') return { kind: 'error' }

  const requestedAt = Date.parse(request.requested_at)
  if (!Number.isFinite(requestedAt)) return { kind: 'error' }

  return {
    kind: 'request',
    status: request.status,
    requestedAt: new Date(requestedAt).toISOString(),
  }
}

export function getAccountDeletionStatusPresentation(
  status: AccountDeletionRequestStatus,
): StatusPresentation {
  return STATUS_PRESENTATIONS[status]
}

export default function AccountDeletionStatus() {
  const [state, setState] = useState<AccountDeletionStatusState>({ kind: 'loading' })
  const requestSequence = useRef(0)

  const loadStatus = useCallback(async () => {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    setState({ kind: 'loading' })

    try {
      const response = await fetch('/api/account/deletion', { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as unknown
      const nextState = parseAccountDeletionStatusPayload(response.status, payload)
      if (requestSequence.current === sequence) setState(nextState)
    } catch {
      if (requestSequence.current === sequence) setState({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    void loadStatus()
    return () => {
      requestSequence.current += 1
    }
  }, [loadStatus])

  return (
    <section
      className="rounded-2xl border border-boot-hairline bg-white p-5"
      aria-labelledby="account-deletion-status-heading"
      aria-busy={state.kind === 'loading'}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-boot-info">ACCOUNT STATUS</p>
          <h2 id="account-deletion-status-heading" className="mt-1 text-lg font-black">계정 삭제 처리 상태</h2>
        </div>
        <button
          type="button"
          disabled={state.kind === 'loading'}
          onClick={() => void loadStatus()}
          className="min-h-10 shrink-0 rounded-xl border border-boot-hairline px-3 text-sm font-black text-boot-primary disabled:cursor-wait disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      <div className="mt-4" aria-live="polite">
        {state.kind === 'loading' ? (
          <p className="rounded-xl bg-boot-soft p-4 text-sm font-bold text-boot-muted" role="status">
            계정 삭제 상태를 불러오는 중…
          </p>
        ) : null}

        {state.kind === 'unrequested' ? (
          <div className="rounded-xl bg-boot-soft p-4">
            <p className="font-black">접수된 탈퇴 요청이 없어요</p>
            <p className="mt-1 text-sm font-bold leading-6 text-boot-muted">계정은 현재 삭제 처리 중이 아니에요.</p>
          </div>
        ) : null}

        {state.kind === 'unauthenticated' ? (
          <div className="rounded-xl bg-[#FFF5DE] p-4" role="alert">
            <p className="font-black text-[#755000]">로그인이 필요해요</p>
            <p className="mt-1 text-sm font-bold leading-6 text-[#755000]">본인 계정의 삭제 상태만 확인할 수 있어요.</p>
            <Link
              href="/login?reauth=1&redirect=%2Faccount"
              className="mt-3 inline-flex min-h-10 items-center font-black text-[#6B4900] underline"
            >
              다시 로그인
            </Link>
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <div className="rounded-xl bg-[#FFF0EE] p-4" role="alert">
            <p className="font-black text-[#B44236]">상태를 불러오지 못했어요</p>
            <p className="mt-1 text-sm font-bold leading-6 text-[#8E3A31]">
              계정이 삭제된 것처럼 표시하지 않았어요. 잠시 후 새로고침해 주세요.
            </p>
          </div>
        ) : null}

        {state.kind === 'request' ? <RequestStatus state={state} /> : null}
      </div>
    </section>
  )
}

function RequestStatus({ state }: {
  state: Extract<AccountDeletionStatusState, { kind: 'request' }>
}) {
  const presentation = getAccountDeletionStatusPresentation(state.status)
  return (
    <div className={`rounded-xl p-4 ${presentation.processing ? 'bg-[#EAF6F4]' : 'bg-boot-soft'}`}>
      <span className={`inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-black ${presentation.processing ? 'text-[#0D514A]' : 'text-boot-muted'}`}>
        {presentation.statusLabel}
      </span>
      <p className="mt-3 font-black">{presentation.title}</p>
      <p className="mt-1 text-sm font-bold leading-6 text-boot-muted">{presentation.body}</p>
      <p className="mt-3 text-xs font-bold text-boot-muted">
        요청 시각 <time dateTime={state.requestedAt}>{formatRequestedAt(state.requestedAt)}</time>
      </p>
    </div>
  )
}

function formatRequestedAt(value: string) {
  return `${new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))} KST`
}

function isAccountDeletionRequestStatus(value: unknown): value is AccountDeletionRequestStatus {
  return typeof value === 'string'
    && (ACCOUNT_DELETION_STATUSES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
