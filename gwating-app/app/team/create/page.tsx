"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { MoodSelector } from "@/components/MoodSelector";
import { loadUser, saveTeam } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { MoodKey, TeamProfile, TeamMember, Gender } from "@/types/matching";

const ROLE_LABELS: Record<string, string> = {
  moodMaker: "🔥 분위기 메이커형",
  coordinator: "🎯 조율자형",
  considerate: "🤍 배려형",
  reactor: "✨ 리액션형",
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
        <main className="py-20 px-4 text-center max-w-[480px] mx-auto">
          <p className="text-body mb-6">성향 테스트를 먼저 완료해야 팀을 만들 수 있어요.</p>
          <Button onClick={() => router.push("/test")}>성향 테스트 하러 가기</Button>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader step={2} totalSteps={3} />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[560px] mx-auto">
          <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">팀 만들기</h1>
          <p className="text-xs text-muted mb-8">팀 정보를 채우고 친구를 초대해요</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* 팀 이름 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                팀 이름 <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="예: 컴공 왕자들, 경영 여신들"
                maxLength={20}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>

            {/* 나이대 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                나이대 <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                placeholder="예: 22~24"
                maxLength={10}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>

            {/* 분위기 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                원하는 과팅 분위기 <span className="text-primary">*</span>
              </label>
              <MoodSelector value={mood} onChange={setMood} />
            </div>

            {/* 팀장 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">팀장 (나)</label>
              <div className="bg-gradient-to-br from-primary-soft to-[#fff0f4] border-[1.5px] border-primary-disabled rounded-[14px] p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-base shadow-[0_2px_8px_rgba(255,90,111,0.25)] shrink-0">
                  {leader.role === "moodMaker" ? "🔥" : leader.role === "coordinator" ? "🎯" : leader.role === "considerate" ? "🤍" : "✨"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-ink">{leader.nickname}</span>
                    <span className="text-[9px] bg-primary text-white rounded-full px-1.5 py-0.5 font-bold">팀장</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {leader.gender && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                          leader.gender === "male"
                            ? "bg-[#f0f5ff] text-[#4f9eff] border-[#cce0ff]"
                            : "bg-primary-soft text-primary border-primary-disabled"
                        }`}
                      >
                        {GENDER_LABELS[leader.gender]}
                      </span>
                    )}
                    <span className="text-xs text-primary font-semibold">
                      {ROLE_LABELS[leader.role]}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 팀원 초대 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                팀원 초대
              </label>

              {/* 초대 코드 */}
              <div className="bg-surface-soft border-[1.5px] border-hairline rounded-[12px] p-3 flex items-center gap-3 mb-3">
                <span className="text-lg">🔗</span>
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wide">초대 코드</div>
                  <div className="text-lg font-black text-ink tracking-[3px] font-mono">{inviteCode}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-[11px] font-bold text-primary bg-primary-soft border border-primary-disabled rounded-full px-3 py-1.5"
                >
                  {copied ? "복사됨!" : "복사"}
                </button>
              </div>

              {/* 대기 중 슬롯 */}
              <div className="flex flex-col gap-2 mb-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="border-[1.5px] border-hairline rounded-[12px] p-3 flex items-center gap-3 bg-white opacity-60"
                  >
                    <div className="w-9 h-9 rounded-[10px] bg-surface-soft border-[1.5px] border-dashed border-hairline flex items-center justify-center text-base shrink-0">
                      ⏳
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-muted">대기 중…</div>
                      <div className="text-[10px] text-[#ff9500] font-semibold">초대 수락 대기</div>
                    </div>
                    <span className="text-[10px] bg-surface-soft text-muted rounded-full px-2 py-1">미정</span>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted text-center">
                초대 코드를 친구에게 공유하면 팀원이 합류해요
                <br />
                <span className="text-[10px] text-muted/60">(현재 코드 공유 기능은 준비 중이에요)</span>
              </p>
            </div>

            <Button type="submit" fullWidth disabled={!isValid}>
              팀 프로필 만들기
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
