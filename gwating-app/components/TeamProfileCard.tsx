import { TeamProfile, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";
import { Avatar } from "./ui/Avatar";
import { Card } from "./ui/Card";

const ROLE_LABELS: Record<MemberRole, string> = {
  moodMaker: "분위기 메이커형",
  coordinator: "조율자형",
  considerate: "배려형",
  reactor: "리액션형",
};

type Props = { team: TeamProfile };

export function TeamProfileCard({ team }: Props) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar label={team.teamName.slice(0, 1)} className="h-12 w-12 text-base" />
        <div>
          <h2 className="text-lg font-extrabold tracking-[-0.4px]">{team.teamName}</h2>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {team.school} · {team.size}명 · {team.ageRange}세
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {team.maleCount !== undefined && team.maleCount > 0 && (
              <span className="rounded-full border border-line bg-[#F7F4EE] px-2 py-0.5 text-[10px] font-bold text-[#6E675C]">
                남 {team.maleCount}
              </span>
            )}
            {team.femaleCount !== undefined && team.femaleCount > 0 && (
              <span className="rounded-full border border-[#FF9D7E] bg-[#FFF0EA] px-2 py-0.5 text-[10px] font-bold text-[#E5402E]">
                여 {team.femaleCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[10px] font-extrabold tracking-[2px] text-muted">원하는 분위기</p>
        <MoodChip mood={team.mood} selected />
      </div>

      <div className="mt-4">
        <p className="mb-1 text-[10px] font-extrabold tracking-[2px] text-muted">팀원 구성</p>
        <div className="flex flex-col">
          {team.members.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-line py-2.5 last:border-0"
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                {m.nickname}
                {m.isLeader && (
                  <span className="rounded-full bg-electric px-1.5 py-0.5 text-[9px] font-bold text-white">
                    팀장
                  </span>
                )}
              </span>
              <span className="text-xs font-medium text-muted">{ROLE_LABELS[m.role]}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
