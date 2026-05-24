import { MoodKey } from "@/types/matching";

const MOOD_CONFIG: Record<MoodKey, { label: string; bg: string; text: string; border: string }> = {
  comfortableTalk: { label: "편한 대화형",        bg: "bg-primary-soft",  text: "text-primary",      border: "border-primary" },
  activeSocial:    { label: "활발한 친목형",       bg: "bg-mint",          text: "text-mint-ink",     border: "border-mint-ink" },
  gamesAndDrinks:  { label: "게임/술자리형",       bg: "bg-amber",         text: "text-amber-ink",    border: "border-amber-ink" },
  respectfulSafe:  { label: "예의/안전 중시형",    bg: "bg-lavender",      text: "text-lavender-ink", border: "border-lavender-ink" },
  naturalIntro:    { label: "자연스러운 소개팅형", bg: "bg-sky",           text: "text-sky-ink",      border: "border-sky-ink" },
};

type Props = {
  mood: MoodKey;
  selected?: boolean;
  onClick?: () => void;
};

export function MoodChip({ mood, selected = false, onClick }: Props) {
  const cfg = MOOD_CONFIG[mood];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center px-4 py-2 rounded-full text-xs font-semibold border transition-all
        ${selected
          ? `${cfg.bg} ${cfg.text} ${cfg.border}`
          : "bg-white text-muted border-hairline hover:border-body"}
      `}
    >
      {cfg.label}
    </button>
  );
}

export { MOOD_CONFIG };
