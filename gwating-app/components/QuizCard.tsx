import { QuizQuestion, QuizChoice } from "@/data/questions";

type Props = {
  question: QuizQuestion;
  current: number;
  total: number;
  onSelect: (score: number) => void;
};

export function QuizCard({ question, current, total, onSelect }: Props) {
  const progress = (current / total) * 100;

  return (
    <div className="bg-white rounded-lg shadow-card p-6 max-w-[560px] w-full mx-auto">
      {/* Progress */}
      <div className="flex justify-between text-xs text-muted mb-3">
        <span>Question {current} of {total}</span>
      </div>
      <div className="h-1.5 bg-surface-soft rounded-full mb-6">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question */}
      <p className="text-base font-semibold text-ink mb-6 leading-snug">
        {question.situation}
      </p>

      {/* Choices */}
      <div className="flex flex-col gap-3">
        {question.choices.map((choice: QuizChoice, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(choice.score)}
            className="
              text-left px-4 py-4 rounded-md border border-hairline text-sm text-body
              hover:border-primary hover:bg-primary-soft transition-all min-h-[56px]
            "
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );
}
