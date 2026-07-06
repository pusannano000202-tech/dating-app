import Link from 'next/link'
import { ArrowLeft, ArrowRight, BarChart3, Plus } from 'lucide-react'
import { findScopes, getCompareScopes, isScopePublic, statsScopes } from '@/lib/community/mock-data'

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

        <section className="mb-4 rounded-[26px] border border-boot-primary/15 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black">선택한 통계 비교</h2>
            <span className="text-xs font-black text-boot-muted">{compareScopes.length}/3</span>
          </div>
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
                  <p className="mt-2 text-sm font-bold text-boot-body">
                    {publicResult ? `${scope.dominantLabel} 쪽이 더 많아요.` : '아직 표본이 부족해요.'}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="grid gap-3">
          {results.map((scope) => {
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
                    <p className="mt-1 text-sm font-bold text-boot-muted">{scope.summary}</p>
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
          })}
        </section>
      </div>
    </main>
  )
}
