import NotificationBell from '@/components/NotificationBell'

export function GroupHeader() {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-boot-primary">
          Group Match
        </p>
        <h1 className="mt-2 text-2xl font-black">친구와 같이 매칭받기</h1>
        <p className="mt-2 text-sm leading-relaxed text-boot-muted">
          정원이 차고 멤버별 성향, 시간, 비중 입력이 끝나면 이번 주 매칭 큐에 들어갈 수 있어요.
        </p>
      </div>
      <NotificationBell />
    </header>
  )
}
