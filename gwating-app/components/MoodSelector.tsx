import { MoodKey } from "@/types/matching";
import { MoodChip } from "./MoodChip";

const ALL_MOODS: MoodKey[] = [
  "comfortableTalk",
  "activeSocial",
  "gamesAndDrinks",
  "respectfulSafe",
  "naturalIntro",
];

type Props = {
  value: MoodKey | null;
  onChange: (mood: MoodKey) => void;
};

export function MoodSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_MOODS.map((mood) => (
        <MoodChip
          key={mood}
          mood={mood}
          selected={value === mood}
          onClick={() => onChange(mood)}
        />
      ))}
    </div>
  );
}
