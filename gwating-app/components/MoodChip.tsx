import { MoodKey } from "@/types/matching";
import { Chip } from "./ui/Chip";

export const MOOD_LABELS: Record<MoodKey, string> = {
  comfortableTalk: "편한 대화형",
  activeSocial: "활발한 친목형",
  gamesAndDrinks: "게임/술자리형",
  respectfulSafe: "예의/안전 중시형",
  naturalIntro: "자연스러운 소개팅형",
};

type Props = {
  mood: MoodKey;
  selected?: boolean;
  onClick?: () => void;
};

export function MoodChip({ mood, selected = false, onClick }: Props) {
  return (
    <Chip selected={selected} onClick={onClick}>
      {MOOD_LABELS[mood]}
    </Chip>
  );
}
