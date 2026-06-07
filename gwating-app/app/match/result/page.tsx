"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { loadTeam, saveMatchFlow } from "@/lib/storage";
import { rankTeams } from "@/lib/matching";
import { mockTeams } from "@/data/mockTeams";
import { TeamProfile } from "@/types/matching";
import { MatchFlowState } from "@/types/match-flow";

export default function MatchResultPage() {
  const router = useRouter();
  const [myTeam, setMyTeam] = useState<TeamProfile | null>(null);
  const [flow, setFlow] = useState<MatchFlowState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const team = loadTeam();
    if (!team) { setLoading(false); return; }
    setMyTeam(team);
    const results = rankTeams(team, mockTeams);
    if (results.length === 0) { setLoading(false); return; }
    const best = results[0];

    const state: MatchFlowState = {
      matchId: `match-${Date.now()}`,
      score: best.score,
      matchedTeam: {
        school: best.team.school,
        ageRange: best.team.ageRange,
        maleCount: best.team.maleCount ?? 0,
        femaleCount: best.team.femaleCount ?? 0,
        mood: best.team.mood,
      },
      schedule: { availableDates: [], availableTimes: [] },
      qaAnswers: [],
      currentQADay: 1,
      currentRotationIndex: 0,
    };
    saveMatchFlow(state);
    setFlow(state);
    setLoading(false);
  }, []);

  if (loading) return null;

  if (!myTeam || !flow) {
    return (
      <>
        <AppHeader />
        <main className="py-20 px-4 text-center max-w-[480px] mx-auto">
          <p className="text-body mb-6">팀 정보가 없어요. 팀을 먼저 만들어주세요.</p>
          <Button onClick={() => router.push("/team/create")}>팀 만들러 가기</Button>
        </main>
      </>
    );
  }

  const { matchedTeam } = flow;

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto flex flex-col items-center text-center gap-6">
          {/* 축하 */}
          <div>
            <div className="text-[44px] mb-3">🎉</div>
            <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">매칭됐어요!</h1>
            <p className="text-sm text-muted">딱 맞는 팀을 찾았어요</p>
          </div>

          {/* 점수 링 */}
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary-soft to-[#ffe4ed] border-[3px] border-primary-disabled flex flex-col items-center justify-center shadow-[0_6px_24px_rgba(255,90,111,0.15)]">
            <span className="text-3xl font-black text-primary leading-none tracking-[-1px]">{flow.score}%</span>
            <span className="text-[10px] font-bold text-primary mt-0.5">궁합 점수</span>
          </div>

          {/* 즉시 공개 */}
          <div className="w-full">
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-3">상대팀 기본 정보</p>
            <div className="flex flex-col gap-2">
              {[
                { icon: "🎓", label: "학과", value: "경영학과" },
                { icon: "🎂", label: "나이대", value: `${matchedTeam.ageRange}세` },
              ].map(({ icon, label, value }) => (
                <div key={label} className="bg-surface-soft rounded-[12px] px-4 py-3 flex items-center gap-3 text-left">
                  <span className="text-lg w-6 text-center">{icon}</span>
                  <div>
                    <div className="text-[10px] font-bold text-muted uppercase tracking-wide">{label}</div>
                    <div className="text-sm font-black text-ink">{value}</div>
                  </div>
                </div>
              ))}
              <div className="bg-surface-soft rounded-[12px] px-4 py-3 flex items-center gap-3 text-left">
                <span className="text-lg w-6 text-center">👥</span>
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wide">성별 구성</div>
                  <div className="flex gap-1.5 mt-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary-disabled">여 {matchedTeam.femaleCount}명</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#f0f5ff] text-[#4f9eff] border border-[#cce0ff]">남 {matchedTeam.maleCount}명</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 잠금 힌트 */}
          <div className="w-full bg-surface-soft rounded-[12px] p-4 text-sm text-muted text-left leading-relaxed">
            <span className="font-bold text-ink">🔒 상대팀 이름은 아직 비공개예요</span><br />
            날짜를 정하고, 만남 전까지 하루씩 Q&A로 알아가요!
          </div>

          <Button fullWidth onClick={() => router.push("/match/schedule")}>
            만날 날짜 정하러 가기 →
          </Button>
        </div>
      </main>
    </>
  );
}
