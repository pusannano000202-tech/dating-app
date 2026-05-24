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
    <div className="bg-white rounded-lg shadow-card p-6 max-w-[480px] w-full">
      {/* 팀 아이덴티티 */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-full bg-primary-soft flex items-center justify-center text-xl font-bold text-primary">
          {initials}
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink">{team.teamName}</h2>
          <p className="text-sm text-muted">
            {team.school} · {team.size}명 · {team.ageRange}세
          </p>
        </div>
      </div>

      {/* 분위기 */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">원하는 분위기</p>
        <MoodChip mood={team.mood} selected />
      </div>

      {/* 멤버 역할 */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">팀원 구성</p>
        <div className="flex flex-col gap-2">
          {team.members.map((m, i) => {
            const info = ROLE_INFO[m.role];
            return (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-ink font-medium">
                  {m.nickname}
                  {m.isLeader && (
                    <span className="ml-1.5 text-xs text-primary font-semibold">팀장</span>
                  )}
                </span>
                <span className="text-muted">
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
