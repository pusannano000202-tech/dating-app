import Link from "next/link";

type Props = {
  step?: number;
  totalSteps?: number;
};

export function AppHeader({ step, totalSteps }: Props) {
  return (
    <header className="h-14 md:h-16 border-b border-hairline-soft bg-white sticky top-0 z-10">
      <div className="max-w-[1120px] mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5">
          <span className="text-primary font-bold text-xl leading-none">●</span>
          <span className="font-bold text-ink text-base">부산대 과팅</span>
          <span className="text-xs text-muted border border-hairline rounded-full px-2 py-0.5 ml-1">
            베타
          </span>
        </Link>
        {step !== undefined && totalSteps !== undefined && (
          <span className="text-xs font-semibold text-muted">
            {step} / {totalSteps} 단계
          </span>
        )}
      </div>
    </header>
  );
}
