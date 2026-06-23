'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

export default function NotificationBell() {
  const [count, setCount] = useState<number>(0)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/notifications/unread-count')
        if (!res.ok) return
        const data = await res.json() as { count: number }
        if (mounted) setCount(data.count ?? 0)
      } catch {
        // ignore
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  return (
    <Link
      href="/notifications"
      className="relative p-2 glass rounded-xl border border-boot-hairline text-boot-body hover:border-boot-primary/30 hover:text-boot-primary"
      aria-label="알림"
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
