import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'

export const PEACH_PANEL =
  'rounded-[28px] border border-[#ead9d2] bg-white shadow-[0_20px_60px_rgba(67,39,30,0.08)]'

export function TonightPageShell({
  eyebrow,
  title,
  description,
  children,
  accent = 'coral',
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  accent?: 'coral' | 'ink'
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fff9f6] text-[#292321]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <header
          className={`relative overflow-hidden rounded-[32px] px-5 py-7 sm:px-8 sm:py-9 ${
            accent === 'ink'
              ? 'bg-[#292321] text-white'
              : 'border border-[#ead9d2] bg-[linear-gradient(135deg,#fff_0%,#fff1eb_56%,#fde1d6_100%)]'
          }`}
        >
          <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#ef8b76]/20 blur-2xl" />
          <div className="relative max-w-3xl">
            <p className={`text-xs font-black tracking-[0.16em] ${accent === 'ink' ? 'text-[#ffcbbb]' : 'text-[#b94b3f]'}`}>
              {eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl">{title}</h1>
            <p className={`mt-3 max-w-2xl text-sm font-semibold leading-6 sm:text-base ${
              accent === 'ink' ? 'text-white/72' : 'text-[#665c58]'
            }`}>
              {description}
            </p>
          </div>
        </header>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  )
}

export function RehearsalBanner() {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="font-black">로컬 체험 화면</p>
        <p className="mt-0.5 font-semibold leading-5">
          결제·저장·신고는 실제로 처리되지 않아요. 화면 흐름과 상태 변화만 안전하게 확인합니다.
        </p>
      </div>
    </div>
  )
}

export function LoadingPanel({ label = '오늘밤 정보를 불러오는 중이에요' }: { label?: string }) {
  return (
    <div className={`${PEACH_PANEL} flex min-h-[280px] items-center justify-center p-8 text-center`} role="status" aria-live="polite">
      <div>
        <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#b94b3f]" aria-hidden />
        <p className="mt-4 font-black">{label}</p>
        <p className="mt-1 text-sm font-semibold text-[#8b7e78]">잠시만 기다려 주세요.</p>
      </div>
    </div>
  )
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className={`${PEACH_PANEL} flex min-h-[280px] items-center justify-center p-8 text-center`} role="alert">
      <div className="max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fce9e4] text-[#b94b3f]">
          <AlertTriangle className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="mt-4 text-xl font-black">정보를 불러오지 못했어요</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#b94b3f] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#b94b3f]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f] focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          다시 불러오기
        </button>
      </div>
    </div>
  )
}

export function EmptyPanel({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className={`${PEACH_PANEL} p-8 text-center`}>
      <p className="text-lg font-black">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#8b7e78]">{description}</p>
    </div>
  )
}

export function MetricCard({
  label,
  value,
  helper,
  tone = 'plain',
}: {
  label: string
  value: string | number
  helper?: string
  tone?: 'plain' | 'coral' | 'amber' | 'sage'
}) {
  const toneClass = {
    plain: 'border-[#ead9d2] bg-white',
    coral: 'border-[#f0c0b6] bg-[#fff0eb]',
    amber: 'border-amber-200 bg-amber-50',
    sage: 'border-emerald-200 bg-emerald-50',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-black text-[#8b7e78]">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-[-0.04em]">{value}</p>
      {helper && <p className="mt-1 text-xs font-semibold leading-5 text-[#8b7e78]">{helper}</p>}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#b94b3f] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(185,75,63,0.22)] transition hover:bg-[#963d34] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f] focus-visible:ring-offset-2 sm:w-auto ${className}`}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  )
}

export function formatKoreanTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(parsed)
}

export function StatusPill({
  children,
  tone = 'plain',
}: {
  children: ReactNode
  tone?: 'plain' | 'good' | 'warn' | 'danger'
}) {
  const style = {
    plain: 'bg-[#f7eee9] text-[#665c58]',
    good: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-900',
    danger: 'bg-rose-100 text-rose-800',
  }[tone]
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${style}`}>{children}</span>
}
