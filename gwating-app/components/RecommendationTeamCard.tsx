import { MatchResult, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";
import { MatchScoreCard } from "./MatchScoreCard";
import { MatchReasonList } from "./MatchReasonList";

const ROLE_EMOJI: Record<MemberRole, string> = {
  moodMaker: "🔥", coordinator: "🎯", considerate: "🤍", reactor: "✨",
};

type Props = { result: MatchResult; rank: number };

export function RecommendationTeamCard({ result, rank }: Props) {
  const { team, score, label, reasons } = result;
  const initials = team.teamName.slice(0, 2);

  return (
    <div className="bg-white rounded-lg shadow-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-surface-soft flex items-center justify-center text-base font-bold text-ink shrink-0">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {rank <= 3 && (
                <span className="text-xs font-bold text-primary bg-primary-soft border border-primary-disabled rounded-full px-2 py-0.5">
                  #{rank}
                </span>
              )}
              <h3 className="text-base font-bold text-ink">{team.teamName}</h3>
            </div>
            <p className="text-xs text-muted mt-0.5">
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
