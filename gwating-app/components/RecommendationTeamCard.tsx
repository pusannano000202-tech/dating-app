import { MatchResult, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";
import { MatchScoreCard } from "./MatchScoreCard";
import { MatchReasonList } from "./MatchReasonList";

const ROLE_EMOJI: Record<MemberRole, string> = {
  moodMaker: "🔥", coordinator: "🎯", considerate: "🤍", reactor: "✨",
};

const RANK_GRADIENTS = [
  "from-primary to-[#ff7e5f]",
  "from-[#7c5cbf] to-[#a07ee8]",
  "from-[#1da462] to-[#34d978]",
];

type Props = { result: MatchResult; rank: number };

export function RecommendationTeamCard({ result, rank }: Props) {
  const { team, score, label, reasons } = result;
  const initials = team.teamName.slice(0, 2);
  const gradient = RANK_GRADIENTS[(rank - 1) % RANK_GRADIENTS.length];
  const isTop = rank === 1;

  return (
    <div
      className={`bg-white rounded-card p-5 flex flex-col gap-3.5 ${
        isTop
          ? "shadow-[0_4px_20px_rgba(255,90,111,0.15),0_0_0_1.5px_#ffd6dd]"
          : "shadow-card"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-[12px] bg-gradient-to-br ${gradient} flex items-center justify-center text-sm font-black text-white shrink-0`}
          >
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              {rank <= 3 && (
                <span
                  className={`text-[10px] font-black text-white rounded-full px-2 py-0.5 bg-gradient-to-r ${gradient}`}
                >
                  #{rank}
                </span>
              )}
              <h3 className="text-sm font-black text-ink">{team.teamName}</h3>
            </div>
            <p className="text-[10px] text-muted">
              {team.school} · {team.size}명 · {team.ageRange}세
            </p>
          </div>
        </div>
        <MatchScoreCard score={score} label={label} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MoodChip mood={team.mood} selected />
        {team.members.slice(0, 4).map((m, i) => (
          <span key={i} className="text-base" title={m.role}>
            {ROLE_EMOJI[m.role]}
          </span>
        ))}
      </div>

      <MatchReasonList reasons={reasons} />
    </div>
  );
}
