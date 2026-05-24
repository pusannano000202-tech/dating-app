"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { TeamProfileCard } from "@/components/TeamProfileCard";
import { loadTeam } from "@/lib/storage";
import { TeamProfile } from "@/types/matching";

export default function TeamDemoPage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTeam(loadTeam());
    setLoading(false);
  }, []);

  if (loading) return null;

  if (!team) {
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

  return (
    <>
      <AppHeader step={2} totalSteps={3} />
      <main className="py-10 px-4 bg-canvas-warm min-h-screen">
        <div className="max-w-[560px] mx-auto">
          <h1 className="text-2xl font-bold text-ink mb-1">우리 팀 프로필</h1>
          <p className="text-sm text-muted mb-8">이 팀으로 매칭을 진행할게요</p>
          <TeamProfileCard team={team} />
          <div className="mt-6 flex flex-col gap-3">
            <Button fullWidth onClick={() => router.push("/match")}>
              매칭 팀 찾기
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => router.push("/team/create")}
            >
              팀 수정하기
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
