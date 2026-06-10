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
    <div className="bg-white rounded-card shadow-card p-5 max-w-[560px] w-full mx-auto">
      {/* Progress */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-bold text-primary">질문 {current} / {total}</span>
        <span className="text-[10px] font-bold text-muted">{Math.round(progress)}%</span>
      </div>
      <div className="h-1 bg-surface-soft rounded-full mb-5">
        <div
          className="h-full bg-gradient-to-r from-primary to-[#ff8a65] rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question */}
      <p className="text-sm font-bold text-ink mb-5 leading-snug">
        <span className="text-primary">Q. </span>
        {question.situation}
      </p>

      {/* Choices */}
      <div className="flex flex-col gap-2.5">
        {question.choices.map((choice: QuizChoice, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(choice.score)}
            className="text-left px-4 py-3 rounded-[12px] border-[1.5px] border-hairline text-sm text-body font-medium hover:border-primary hover:bg-primary-soft hover:text-primary hover:font-bold transition-all min-h-[52px]"
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );
}
