"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TeamProfileCard } from "@/components/TeamProfileCard";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { TabBar } from "@/components/ui/TabBar";
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

  return (
    <>
      <PageShell withTabBar>
        <div>
          <p className="text-xs font-semibold text-muted">이 팀으로 매칭을 진행해요</p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.8px]">내 팀</h1>
        </div>
        <div className="mt-5">
          <TeamProfileCard team={team} />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button fullWidth onClick={() => router.push("/match")}>
            매칭 팀 찾기
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.push("/team/create")}>
            팀 수정하기
          </Button>
        </div>
      </PageShell>
      <TabBar />
    </>
  );
}
