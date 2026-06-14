'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Search } from 'lucide-react'

type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'

type GroupPayload = {
  group: { status: GroupStatus } | null
}

export default function ActiveMatchingHomeCard() {
  const [groupStatus, setGroupStatus] = useState<GroupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const res = await fetch('/api/groups')
        if (!res.ok) {
          if (mounted) {
            setError(true)
            setLoading(false)
          }
          return
        }

        const data = (await res.json()) as GroupPayload
        if (!mounted) return

        setGroupStatus(data.group?.status ?? null)
      } catch {
        if (mounted) setError(true)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [])

  if (loading || error || groupStatus === null) return null

  const inQueue = groupStatus === 'ready' || groupStatus === 'in_pool'
  const hasResult = groupStatus === 'matched'

  if (!inQueue && !hasResult) return null

  if (inQueue) {
    return (
      <section className="mb-5 rounded-3xl border border-boot-primary/20 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <Search size={18} />
          </span>
          <div>
            <p className="text-sm font-black text-boot-ink">매칭 찾는 중</p>
            <p className="text-xs text-boot-muted">
              지금 들어간 매칭 큐 상태를 바로 확인할 수 있어요.
            </p>
          </div>
        </div>
        <div className="mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {groupStatus === 'ready'
            ? '준비 완료 · 큐 진입 대기 중'
            : '큐 진입 완료 · 매칭 탐색 중'}
        </div>
        <Link
          href="/group/create?from=home-queue"
          className="btn-gradient block w-full rounded-2xl py-2.5 text-center text-sm font-black"
        >
          진행중인 매칭 결과 확인하기
        </Link>
      </section>
    )
  }

  return (
    <section className="mb-5 rounded-3xl border border-boot-hairline bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          <CalendarClock size={18} />
        </span>
        <div>
          <p className="text-sm font-black text-boot-ink">매칭 결과 확인</p>
          <p className="text-xs text-boot-muted">
            확정된 매칭의 시간, 장소, 데일리 카드를 확인하세요.
          </p>
        </div>
      </div>
      <Link
        href="/match"
        className="block w-full rounded-2xl border border-boot-primary/25 bg-boot-soft px-4 py-2.5 text-center text-sm font-black text-boot-primary"
      >
        매칭 결과 확인하기
      </Link>
    </section>
  )
}
