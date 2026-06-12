import Link from "next/link";
import { BoltLogo } from "@/components/ui/BoltLogo";

type Props = {
  step?: number;
  totalSteps?: number;
};

export function AppHeader({ step, totalSteps }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur-xl">
      <div className="flex h-12 items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <BoltLogo size={18} />
          <span className="text-[15px] font-black tracking-[-0.5px] text-ink">부팅</span>
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
