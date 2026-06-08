import { AppHeader } from "@/components/AppHeader";
import { getMatchOverview } from "@/lib/adminData";
import { MoodKey, MatchResult } from "@/types/matching";

const MOOD_LABELS: Record<MoodKey, string> = {
  comfortableTalk: "편한 대화형",
  activeSocial: "활발한 친목형",
  gamesAndDrinks: "게임/술자리형",
  respectfulSafe: "예의/안전 중시형",
  naturalIntro: "자연스러운 소개팅형",
};

const LABEL_STYLES: Record<MatchResult["label"], string> = {
  "Strong vibe fit": "bg-mint text-mint-ink",
  "Good with some differences": "bg-amber text-amber-ink",
  "Different atmosphere preferences": "bg-surface-soft text-muted",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-muted w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-soft rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-[#ff8a65] rounded-full"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-ink w-7 text-right">{value}</span>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const overview = await getMatchOverview();

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[720px] mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-xl font-black text-ink tracking-[-0.5px] mb-1">매칭 검수 대시보드</h1>
            <p className="text-xs text-muted leading-relaxed">
              자동 매칭 엔진이 각 팀에게 어떤 추천을 내놓는지, 점수 산정 근거와 함께 한눈에 확인해요.
              <br />
              (현재는 mock 데이터 기준 — Supabase 연동 시 <code className="text-[11px] bg-surface-soft rounded px-1">lib/adminData.ts</code>의 데이터 소스만 교체하면 돼요)
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {overview.map(({ team, matches }) => (
              <section key={team.teamName} className="border border-hairline-soft rounded-[16px] overflow-hidden">
                {/* 팀 헤더 */}
                <div className="bg-surface-soft px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-ink">{team.teamName}</p>
                    <p className="text-[10px] text-muted">
                      {MOOD_LABELS[team.mood]} · {team.size}인 · {team.ageRange}세
                      {team.maleCount !== undefined && (
                        <> · 남 {team.maleCount} / 여 {team.femaleCount ?? 0}</>
                      )}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-muted bg-white border border-hairline-soft rounded-full px-2 py-1">
                    추천 {matches.length}팀
                  </span>
                </div>

                {/* 추천 랭킹 */}
                <div className="flex flex-col divide-y divide-hairline-soft">
                  {matches.map((m, i) => (
                    <div key={m.team.teamName} className="px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-primary w-5">#{i + 1}</span>
                          <span className="text-xs font-bold text-ink">{m.team.teamName}</span>
                          <span className="text-[9px] text-muted">{MOOD_LABELS[m.team.mood]}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 ${LABEL_STYLES[m.label]}`}>
                            {m.label}
                          </span>
                          <span className="text-sm font-black text-ink">{m.score}점</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 max-w-[360px]">
                        <ScoreBar label="분위기" value={m.vibeScore} />
                        <ScoreBar label="역할" value={m.roleScore} />
                        <ScoreBar label="조건" value={m.conditionScore} />
                      </div>
                      <ul className="flex flex-wrap gap-1.5">
                        {m.reasons.map((r, j) => (
                          <li key={j} className="text-[9px] text-muted bg-surface-soft rounded-full px-2 py-1">
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
