import { MatchResult } from "@/types/matching";

const LABEL_COLORS: Record<MatchResult["label"], string> = {
  "Strong vibe fit":                  "text-primary",
  "Good with some differences":       "text-amber-ink",
  "Different atmosphere preferences": "text-muted",
};

const LABEL_KO: Record<MatchResult["label"], string> = {
  "Strong vibe fit":                  "분위기 완벽 일치",
  "Good with some differences":       "대체로 잘 맞아요",
  "Different atmosphere preferences": "스타일이 조금 달라요",
};

type Props = { score: number; label: MatchResult["label"] };

export function MatchScoreCard({ score, label }: Props) {
  return (
    <div className="text-right shrink-0">
      <p className="text-[32px] font-black text-primary leading-none tracking-[-1px]">
        {score}
        <span className="text-base">%</span>
      </p>
      <p className="text-[10px] font-bold text-muted mt-0.5">궁합 점수</p>
      <p className={`text-[10px] font-semibold mt-0.5 ${LABEL_COLORS[label]}`}>
        {LABEL_KO[label]}
      </p>
    </div>
  );
}
