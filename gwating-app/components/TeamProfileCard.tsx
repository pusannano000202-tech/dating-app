import { TeamProfile, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";

const ROLE_INFO: Record<MemberRole, { label: string; emoji: string }> = {
  moodMaker:   { label: "분위기 메이커형", emoji: "🔥" },
  coordinator: { label: "조율자형",         emoji: "🎯" },
  considerate: { label: "배려형",           emoji: "🤍" },
  reactor:     { label: "리액션형",         emoji: "✨" },
};

type Props = { team: TeamProfile };

export function TeamProfileCard({ team }: Props) {
  const initials = team.teamName.slice(0, 2);

  return (
    <div className="bg-white rounded-card shadow-card p-5 max-w-[480px] w-full">
      {/* 팀 아이덴티티 */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-lg font-black text-white shadow-[0_3px_10px_rgba(255,90,111,0.25)] shrink-0">
          {initials}
        </div>
        <div>
          <h2 className="text-[18px] font-black text-ink tracking-[-0.4px]">{team.teamName}</h2>
          <p className="text-xs text-muted mt-0.5">
            {team.school} · {team.size}명 · {team.ageRange}세
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {team.maleCount !== undefined && team.maleCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#f0f5ff] text-[#4f9eff] border border-[#cce0ff]">
                남 {team.maleCount}
              </span>
            )}
            {team.femaleCount !== undefined && team.femaleCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-soft text-primary border border-primary-disabled">
                여 {team.femaleCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 분위기 */}
      <div className="mb-4">
        <p className="text-[10px] font-bold text-muted uppercase tracking-wide mb-2">원하는 분위기</p>
        <MoodChip mood={team.mood} selected />
      </div>

      {/* 팀원 */}
      <div>
        <p className="text-[10px] font-bold text-muted uppercase tracking-wide mb-2">팀원 구성</p>
        <div className="flex flex-col">
          {team.members.map((m, i) => {
            const info = ROLE_INFO[m.role];
            return (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-hairline-soft last:border-0"
              >
                <span className="text-sm font-semibold text-ink flex items-center gap-1.5">
                  {m.nickname}
                  {m.isLeader && (
                    <span className="text-[10px] text-primary font-bold bg-primary-soft px-1.5 py-0.5 rounded-full">
                      팀장
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted">
                  {info.emoji} {info.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
