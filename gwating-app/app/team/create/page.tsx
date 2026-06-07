"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { MoodSelector } from "@/components/MoodSelector";
import { MemberRoleCard } from "@/components/MemberRoleCard";
import { loadUser, saveTeam } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { MoodKey, MemberRole, TeamProfile, TeamMember } from "@/types/matching";

type MemberDraft = { nickname: string; role: MemberRole | "" };

export default function TeamCreatePage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [mood, setMood] = useState<MoodKey | null>(null);
  const [leader, setLeader] = useState<TeamMember | null>(null);
  const [extraMembers, setExtraMembers] = useState<MemberDraft[]>([
    { nickname: "", role: "" },
  ]);

  useEffect(() => {
    const user = loadUser();
    if (!user) return;
    const role = classifyRole(user.traits);
    setLeader({
      nickname:  user.nickname,
      role,
      traits:    user.traits,
      isLeader:  true,
    });
  }, []);

  function addMember() {
    if (extraMembers.length >= 4) return;
    setExtraMembers((prev) => [...prev, { nickname: "", role: "" }]);
  }

  function removeMember(i: number) {
    setExtraMembers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateMember(i: number, patch: Partial<MemberDraft>) {
    setExtraMembers((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m))
    );
  }

  const isValid =
    teamName.trim() !== "" &&
    ageRange.trim() !== "" &&
    mood !== null &&
    leader !== null &&
    extraMembers.length > 0 &&
    extraMembers.every((m) => m.nickname.trim() !== "" && m.role !== "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !leader || !mood) return;

    const members: TeamMember[] = [
      leader,
      ...extraMembers.map((m) => ({
        nickname: m.nickname.trim(),
        role:     m.role as MemberRole,
      })),
    ];

    const team: TeamProfile = {
      teamName:  teamName.trim(),
      school:    "부산대학교",
      region:    "부산",
      size:      members.length,
      ageRange:  ageRange.trim(),
      mood,
      members,
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
      <main className="py-10 px-4">
        <div className="max-w-[560px] mx-auto">
          <h1 className="text-2xl font-bold text-ink mb-1">팀 만들기</h1>
          <p className="text-sm text-muted mb-8">팀 정보를 입력하고 팀원 역할을 골라주세요</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">팀 이름</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="예: 컴공 왕자들, 경영 여신들"
                maxLength={20}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">나이대</label>
              <input
                type="text"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                placeholder="예: 22~24"
                maxLength={10}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">원하는 과팅 분위기</label>
              <MoodSelector value={mood} onChange={setMood} />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">팀장 (나)</label>
              <div className="bg-gradient-to-br from-primary-soft to-[#fff0f4] border-[1.5px] border-primary-disabled rounded-[14px] p-4 text-sm">
                <span className="font-semibold text-ink">{leader.nickname}</span>
                <span className="ml-2 text-primary font-semibold">
                  {leader.role === "moodMaker"   && "🔥 분위기 메이커형"}
                  {leader.role === "coordinator" && "🎯 조율자형"}
                  {leader.role === "considerate" && "🤍 배려형"}
                  {leader.role === "reactor"     && "✨ 리액션형"}
                </span>
                <span className="ml-2 text-xs text-muted">(성향 테스트 결과)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                팀원 ({extraMembers.length}/4)
              </label>
              <div className="flex flex-col gap-3">
                {extraMembers.map((m, i) => (
                  <MemberRoleCard
                    key={i}
                    index={i}
                    nickname={m.nickname}
                    role={m.role}
                    onNicknameChange={(val) => updateMember(i, { nickname: val })}
                    onRoleChange={(val) => updateMember(i, { role: val })}
                    onRemove={() => removeMember(i)}
                  />
                ))}
                {extraMembers.length < 4 && (
                  <button
                    type="button"
                    onClick={addMember}
                    className="border-[1.5px] border-dashed border-hairline rounded-[12px] py-3 text-sm text-muted hover:border-primary hover:text-primary transition-colors"
                  >
                    + 팀원 추가
                  </button>
                )}
              </div>
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
