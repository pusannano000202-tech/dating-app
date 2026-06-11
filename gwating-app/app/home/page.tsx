"use client";

import { useEffect, useState } from "react";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { TabBar } from "@/components/ui/TabBar";
import { loadTeam } from "@/lib/storage";

const FALLBACK = { teamName: "공대 F4", initials: ["성", "현", "준"] };

export default function HomeDashboardPage() {
  const [teamName, setTeamName] = useState(FALLBACK.teamName);
  const [initials, setInitials] = useState<string[]>(FALLBACK.initials);

  useEffect(() => {
    const team = loadTeam();
    if (team?.teamName) setTeamName(team.teamName);
    if (team?.members?.length) {
      setInitials(team.members.map((m) => m.nickname.slice(0, 1)));
    }
  }, []);

  return (
    <>
      <PageShell withTabBar>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold text-muted">좋은 저녁이에요</p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.8px]">
              오늘의 매칭
            </h1>
          </div>
          <Avatar label={initials[0] ?? "부"} />
        </div>

        <Card variant="dark" className="relative mt-5 overflow-hidden">
          <AuroraBlob className="-right-12 -top-14 h-36 w-36 bg-[#FF7A3D]/15 blur-[42px]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-base font-extrabold tracking-[-0.4px]">
                {teamName}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-[#FF7A3D]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#FFB9A3]">
                <span className="dot-live h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
                매칭 탐색 중
              </span>
            </div>
            <div className="mt-4 flex">
              {initials.map((ch, i) => (
                <Avatar
                  key={`${ch}-${i}`}
                  label={ch}
                  paletteIndex={i}
                  className="-mr-2 h-9 w-9 border-[2.5px] border-[#1F1B17] text-xs"
                />
              ))}
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-[#F2EEE7]/30 text-xs font-semibold text-[#F2EEE7]/50">
                +
              </span>
            </div>
            <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#F2EEE7]/10">
              <div className="h-full w-3/4 animate-fill rounded-full bg-electric" />
            </div>
            <p className="mt-2 text-[11px] font-semibold text-[#F2EEE7]/55">
              팀 성향 분석 3/4 완료 — 한 명만 더!
            </p>
          </div>
        </Card>

        <Card className="mt-4" pressable>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold tracking-[2.5px] text-muted">
              추천 상대팀
            </span>
            <span className="bg-electric bg-clip-text text-sm font-black text-transparent">
              케미 92%
            </span>
          </div>
          <h2 className="mt-2 text-lg font-extrabold tracking-[-0.4px]">
            간호 트리오
          </h2>
          <div className="mt-3 flex">
            <Avatar frost className="-mr-2" />
            <Avatar frost className="-mr-2" />
            <Avatar frost />
          </div>
          <div className="mt-3.5 flex gap-1.5">
            {["# 차분한", "# 카페파", "# 수요일"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-line bg-[#F7F4EE] px-3 py-1.5 text-[11px] font-semibold text-[#6E675C]"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-3.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <LockIcon />
            프로필은 매칭 확정 후에 공개돼요
          </p>
        </Card>
      </PageShell>
      <TabBar />
    </>
  );
}

function LockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#B5AFA4"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
