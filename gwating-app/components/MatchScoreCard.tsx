import { MatchResult } from "@/types/matching";

const LABEL_COLORS: Record<MatchResult["label"], string> = {
  "Strong vibe fit":                  "text-primary",
  "Good with some differences":       "text-amber-ink",
  "Different atmosphere preferences": "text-muted",
};

type Props = { score: number; label: MatchResult["label"] };

export function MatchScoreCard({ score, label }: Props) {
  return (
    <div className="text-center">
      <p className="text-[48px] font-extrabold text-primary leading-none">{score}%</p>
      <p className={`text-sm font-semibold mt-1 ${LABEL_COLORS[label]}`}>{label}</p>
    </div>
  );
}
