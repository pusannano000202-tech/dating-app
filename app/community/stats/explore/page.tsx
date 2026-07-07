import Link from 'next/link'
import { ArrowLeft, ArrowRight, BarChart3, Plus, ShieldCheck } from 'lucide-react'
import { MIN_PUBLIC_SAMPLE_SIZE, findScopes, getCompareScopes, isScopePublic, statsScopes } from '@/lib/community/mock-data'

type StatsExplorePageProps = {
  searchParams?: Record<string, string | string[] | undefined>
}

function getParam(searchParams: StatsExplorePageProps['searchParams'], key: string): string {
  const value = searchParams?.[key]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function toScopeIds(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export default function StatsExplorePage({ searchParams }: StatsExplorePageProps) {
  const query = getParam(searchParams, 'q')
  const scopeIds = toScopeIds(getParam(searchParams, 'scope_ids'))
  const results = findScopes(query)
  const selectedScopes = getCompareScopes(scopeIds)
  const compareScopes = selectedScopes.length > 0 ? selectedScopes : results.slice(0, 3)

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <Link href="/community" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-boot-body">
          <ArrowLeft size={16} className="text-boot-primary" />
          커뮤니티로
        </Link>

        <section className="mb-4 rounded-[30px] border border-boot-primary/15 bg-white p-5 shadow-[var(--boot-card-shadow)]">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Explore Stats</p>
          <h1 className="mt-1 text-2xl font-black">{query ? `"${query}" 결과` : '통계 둘러보기'}</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
            비교는 3개까지만 보여줘요. 학과 통계는 최소 30명 이상일 때만 공개합니다.
          </p>
        </section>

        <section className="mb-4 flex items-start gap-3 rounded-[24px] border border-boot-primary/15 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <ShieldCheck size={17} />
          </span>
          <p className="text-xs font-bold leading-5 text-boot-muted">
            개인 답변은 보여주지 않고, 표본이 부족한 학과는 요약과 퍼센트를 모두 숨겨요.
          </p>
        </section>

        <section className="mb-4 rounded-[26px] border border-boot-primary/15 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black">선택한 통계 비교</h2>
            <span className="text-xs font-black text-boot-muted">{compareScopes.length}/3</span>
          </div>
          {compareScopes.length > 0 ? (
            <div className="grid gap-2">
              {compareScopes.map((scope) => {
              const publicResult = isScopePublic(scope)
              return (
                <div key={scope.id} className="rounded-2xl bg-boot-soft p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">
                        {scope.parentLabel ? `${scope.parentLabel} ${scope.label}` : scope.label}
                      </p>
                      <p className="mt-1 text-xs font-bold text-boot-muted">응답 {scope.sampleSize}명 · {scope.topic}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-boot-primary">
                      {publicResult ? `${scope.percentage}%` : '비공개'}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={[
                        'h-full rounded-full',
                        publicResult ? 'bg-boot-primary' : 'bg-boot-muted/30',
                      ].join(' ')}
                      style={{ width: `${scope.percentage ?? Math.min(100, Math.round((scope.sampleSize / MIN_PUBLIC_SAMPLE_SIZE) * 100))}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-black">
                    <span className={publicResult ? 'text-boot-primary' : 'text-boot-muted'}>
                      {publicResult ? '공개 가능' : '표본 대기'}
                    </span>
                    <span className="text-boot-muted">
                      {publicResult ? scope.dominantLabel : `${scope.sampleSize}/${MIN_PUBLIC_SAMPLE_SIZE}명`}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-boot-body">
                    {publicResult ? `${scope.dominantLabel} 쪽이 더 많아요.` : '아직 표본이 부족해요.'}
                  </p>
                </div>
              )
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-boot-soft px-4 py-4">
              <p className="text-sm font-black text-boot-body">아직 공개 가능한 통계가 없어요</p>
              <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">
                이 학교나 학과는 mock 데이터가 아직 없어서 실제 DB 연결 전까지 결과를 숨겨둡니다.
              </p>
            </div>
          )}
        </section>

        <Link
          href="/community/stats"
          className="mb-4 flex items-center justify-between rounded-2xl bg-boot-ink px-4 py-3 text-sm font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
        >
          <span>다른 취향 주제 고르기</span>
          <ArrowRight size={16} />
        </Link>

        <section className="grid gap-3">
          {results.length > 0 ? results.map((scope) => {
            const selectedIds = [...new Set([...compareScopes.map((item) => item.id), scope.id])].slice(0, 3)
            const publicResult = isScopePublic(scope)
            return (
              <Link
                key={scope.id}
                href={`/community/stats/explore?q=${encodeURIComponent(query || scope.label)}&scope_ids=${selectedIds.join(',')}`}
                className="rounded-[24px] border border-boot-hairline bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black">
                      {scope.parentLabel ? `${scope.parentLabel} ${scope.label}` : scope.label}
                    </p>
                    <p className="mt-1 text-sm font-bold text-boot-muted">
                      {publicResult ? scope.summary : '아직 표본이 부족해요'}
                    </p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
                    {statsScopes.some((item) => item.id === scope.id) ? <Plus size={16} /> : <BarChart3 size={16} />}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs font-black">
                  <span className={publicResult ? 'text-boot-primary' : 'text-boot-muted'}>
                    {publicResult ? '비교에 추가' : '최소 응답 수 대기'}
                  </span>
                  <ArrowRight size={14} className="text-boot-primary" />
                </div>
              </Link>
            )
          }) : (
            <div className="rounded-[24px] border border-boot-hairline bg-white p-4 text-sm font-bold leading-6 text-boot-muted shadow-sm">
              검색 결과가 없어요. 지금은 부산대/부경대/동아대 일부 mock 통계만 열어두고 있어요.
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
