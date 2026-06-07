"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { RecommendationTeamCard } from "@/components/RecommendationTeamCard";
import { loadTeam } from "@/lib/storage";
import { rankTeams } from "@/lib/matching";
import { mockTeams } from "@/data/mockTeams";
import { TeamProfile, MatchResult } from "@/types/matching";

export default function MatchPage() {
  const router = useRouter();
  const [myTeam, setMyTeam] = useState<TeamProfile | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const team = loadTeam();
    if (team) {
      setMyTeam(team);
      setResults(rankTeams(team, mockTeams));
    }
    setLoading(false);
  }, []);

  if (loading) return null;

  if (!myTeam) {
    return (
      <>
        <AppHeader />
        <main className="py-20 px-4 text-center max-w-[480px] mx-auto">
          <p className="text-body mb-2">팀 프로필이 필요해요.</p>
          <p className="text-sm text-muted mb-6">
            성향 테스트를 완료하고 팀을 만들어야 추천을 볼 수 있어요.
          </p>
          <Button onClick={() => router.push("/")}>처음부터 시작하기</Button>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader step={3} totalSteps={3} />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[640px] mx-auto">
          <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">추천 과팅 팀</h1>
          <p className="text-xs text-muted mb-8">
            <span className="font-bold text-ink">{myTeam.teamName}</span>과 잘 어울릴 팀을 분위기·역할·조건 궁합으로 추천했어요.
          </p>
          <div className="flex flex-col gap-4">
            {results.map((result, i) => (
              <RecommendationTeamCard key={result.team.teamName} result={result} rank={i + 1} />
            ))}
          </div>
          <div className="mt-8">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => router.push("/team/demo")}
            >
              우리 팀으로 돌아가기
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
