"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChemiRing } from "@/components/ui/ChemiRing";
import { LockIcon } from "@/components/ui/LockIcon";
import { PageShell } from "@/components/ui/PageShell";
import { TabBar } from "@/components/ui/TabBar";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
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
        <PageShell withTabBar className="items-center justify-center text-center">
          <p className="text-sm font-medium leading-relaxed text-muted">
            팀 정보가 없어요.
            <br />팀을 먼저 만들어주세요.
          </p>
          <div className="mt-6 w-full">
            <Button fullWidth onClick={() => router.push("/team/create")}>
              팀 만들러 가기
            </Button>
          </div>
        </PageShell>
        <TabBar />
      </>
    );
  }

  const { matchedTeam } = flow;

  return (
    <>
      <PageShell withTabBar className="items-center text-center">
        <AuroraBlob className="-left-24 -top-16 h-56 w-56 bg-[#FF3D5A]/10" />
        <p className="mt-5 text-[10px] font-extrabold tracking-[3.5px] text-[#FF6A4E]">
          ✦ MATCH FOUND
        </p>
        <div className="mt-5">
          <ChemiRing score={flow.score} />
        </div>
        <h1 className="mt-5 text-[21px] font-black tracking-[-0.6px]">매칭됐어요!</h1>
        <p className="mt-1 text-sm font-medium text-muted">딱 맞는 팀을 찾았어요</p>

        <div className="mt-6 flex w-full flex-col gap-2.5 text-left">
          <Card className="flex items-center justify-between p-4">
            <span className="text-[10px] font-extrabold tracking-[2px] text-muted">학과</span>
            <span className="text-sm font-extrabold text-ink">경영학과</span>
          </Card>
          <Card className="flex items-center justify-between p-4">
            <span className="text-[10px] font-extrabold tracking-[2px] text-muted">나이대</span>
            <span className="text-sm font-extrabold text-ink">{matchedTeam.ageRange}세</span>
          </Card>
          <Card className="flex items-center justify-between p-4">
            <span className="text-[10px] font-extrabold tracking-[2px] text-muted">성별 구성</span>
            <span className="flex gap-1.5">
              <span className="rounded-full border border-[#FF9D7E] bg-[#FFF0EA] px-2 py-0.5 text-[11px] font-bold text-[#E5402E]">
                여 {matchedTeam.femaleCount}명
              </span>
              <span className="rounded-full border border-line bg-[#F7F4EE] px-2 py-0.5 text-[11px] font-bold text-[#6E675C]">
                남 {matchedTeam.maleCount}명
              </span>
            </span>
          </Card>
        </div>

        <Card className="mt-3 w-full p-4 text-left">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
            <LockIcon /> 상대팀 이름은 아직 비공개예요
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-muted">
            날짜를 정하고, 만남 전까지 하루씩 Q&A로 알아가요
          </p>
        </Card>

        <div className="mt-auto w-full pt-6">
          <Button variant="electric" fullWidth onClick={() => router.push("/match/schedule")}>
            만날 날짜 정하러 가기
          </Button>
        </div>
      </PageShell>
      <TabBar />
    </>
  );
}
