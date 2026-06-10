import Link from "next/link";

type Props = {
  step?: number;
  totalSteps?: number;
};

export function AppHeader({ step, totalSteps }: Props) {
  return (
    <header className="h-11 border-b border-hairline-soft bg-white/90 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-[1120px] mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-xs shadow-[0_2px_6px_rgba(255,90,111,0.25)]">
            ⚡
          </div>
          <span className="font-black text-ink text-[15px] tracking-[-0.5px]">부팅</span>
        </Link>
        {step !== undefined && totalSteps !== undefined && (
          <span className="text-[10px] font-bold text-muted">
            {step} / {totalSteps} 단계
          </span>
        )}
      </div>
    </header>
  );
}
