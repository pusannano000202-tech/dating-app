"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { MoodSelector } from "@/components/MoodSelector";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageShell } from "@/components/ui/PageShell";
import { loadUser, saveTeam } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { MoodKey, TeamProfile, TeamMember, Gender } from "@/types/matching";

const ROLE_LABELS: Record<string, string> = {
  moodMaker: "분위기 메이커형",
  coordinator: "조율자형",
  considerate: "배려형",
  reactor: "리액션형",
};

const GENDER_LABELS: Record<Gender, string> = {
  male: "남자",
  female: "여자",
};

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return (
    "BT-" +
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  );
}

export default function TeamCreatePage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [mood, setMood] = useState<MoodKey | null>(null);
  const [leader, setLeader] = useState<TeamMember | null>(null);
  const inviteCode = useMemo(() => generateInviteCode(), []);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const user = loadUser();
    if (!user) return;
    setLeader({
      nickname: user.nickname,
      role: classifyRole(user.traits),
      traits: user.traits,
      isLeader: true,
      gender: user.gender,
    });
  }, []);

  function handleCopyCode() {
    navigator.clipboard.writeText(inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isValid = teamName.trim() !== "" && ageRange.trim() !== "" && mood !== null && leader !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !leader || !mood) return;

    const members: TeamMember[] = [leader];
    const maleCount = members.filter((m) => m.gender === "male").length;
    const femaleCount = members.filter((m) => m.gender === "female").length;

    const team: TeamProfile = {
      teamName: teamName.trim(),
      school: "부산대학교",
      region: "부산",
      size: members.length,
      ageRange: ageRange.trim(),
      mood,
      members,
      maleCount,
      femaleCount,
    };
    saveTeam(team);
    router.push("/team/demo");
  }

  if (!leader) {
    return (
      <>
        <AppHeader />
        <PageShell className="items-center justify-center text-center">
          <p className="text-sm font-medium leading-relaxed text-muted">
            성향 테스트를 먼저 완료해야
            <br />팀을 만들 수 있어요.
          </p>
          <div className="mt-6 w-full">
            <Button fullWidth onClick={() => router.push("/test")}>
              성향 테스트 하러 가기
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  const inputCls =
    "h-12 w-full rounded-btn border-[1.5px] border-line bg-white px-4 text-base text-ink focus:border-[#FF9D7E] focus:outline-none";
  const labelCls = "mb-2 block text-[10px] font-extrabold tracking-[2px] text-muted";

  return (
    <>
      <AppHeader step={2} totalSteps={3} />
      <PageShell className="pt-7">
        <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ TEAM</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.8px]">팀 만들기</h1>
        <p className="mt-1 text-xs font-medium text-muted">팀 정보를 채우고 친구를 초대해요</p>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-6">
          <div>
            <label className={labelCls}>
              팀 이름 <span className="text-[#E5402E]">*</span>
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="예: 컴공 왕자들, 경영 여신들"
              maxLength={20}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              나이대 <span className="text-[#E5402E]">*</span>
            </label>
            <input
              type="text"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              placeholder="예: 22~24"
              maxLength={10}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              원하는 과팅 분위기 <span className="text-[#E5402E]">*</span>
            </label>
            <MoodSelector value={mood} onChange={setMood} />
          </div>

          <div>
            <label className={labelCls}>팀장 (나)</label>
            <Card className="flex items-center gap-3 p-4">
              <Avatar label={leader.nickname.slice(0, 1)} />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold">{leader.nickname}</span>
                  <span className="rounded-full bg-electric px-1.5 py-0.5 text-[9px] font-bold text-white">
                    팀장
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-muted">
                  {leader.gender && <span>{GENDER_LABELS[leader.gender]}</span>}
                  {leader.gender && <span>·</span>}
                  <span>{ROLE_LABELS[leader.role]}</span>
                </div>
              </div>
            </Card>
          </div>

          <div>
            <label className={labelCls}>팀원 초대</label>

            <Card className="mb-3 flex items-center gap-3 p-4">
              <div className="flex-1">
                <div className="text-[10px] font-extrabold tracking-[2px] text-muted">
                  초대 코드
                </div>
                <div className="font-mono text-lg font-black tracking-[3px]">{inviteCode}</div>
              </div>
              <Chip selected={copied} onClick={handleCopyCode}>
                {copied ? "복사됨!" : "복사"}
              </Chip>
            </Card>

            <div className="mb-2 flex flex-col gap-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-card border border-dashed border-[#D8D2C7] bg-white/60 p-4"
                >
                  <Avatar frost className="h-9 w-9" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-muted">대기 중…</div>
                    <div className="text-[10px] font-semibold text-[#FF8A5C]">초대 수락 대기</div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-[10px] font-medium leading-relaxed text-muted">
              초대 코드를 친구에게 공유하면 팀원이 합류해요
              <br />
              <span className="text-muted/60">(현재 코드 공유 기능은 준비 중이에요)</span>
            </p>
          </div>

          <Button type="submit" fullWidth disabled={!isValid}>
            팀 프로필 만들기
          </Button>
        </form>
      </PageShell>
    </>
  );
}
