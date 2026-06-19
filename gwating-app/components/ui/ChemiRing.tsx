import { useId } from "react";

const CIRCUMFERENCE = 414.69; // 2π × r(66) — globals.css의 ring-draw from 값과 일치

type Props = {
  score: number;
  label?: string;
  className?: string;
};

export function ChemiRing({ score, label = "CHEMI", className = "" }: Props) {
  const gradientId = useId();
  const clamped = Math.min(100, Math.max(0, score));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div className={`relative h-[172px] w-[172px] animate-floaty ${className}`}>
      <svg width="172" height="172" viewBox="0 0 172 172" className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF3D5A" />
            <stop offset="1" stopColor="#FF7A3D" />
          </linearGradient>
        </defs>
        <circle cx="86" cy="86" r="66" fill="none" stroke="rgba(27,25,22,0.07)" strokeWidth="13" />
        <circle
          cx="86"
          cy="86"
          r="66"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ animation: "ring-draw 1.6s cubic-bezier(0.22,1,0.36,1) 0.3s both" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="text-[46px] font-black leading-none tracking-[-2px] text-ink">{clamped}</b>
        <span className="mt-1 text-[11px] font-bold tracking-[1px] text-muted">{label}</span>
      </div>
    </div>
  );
}
