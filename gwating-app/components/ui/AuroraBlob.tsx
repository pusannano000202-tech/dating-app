type Props = { className?: string };

/** 블러 처리된 드리프트 블롭 — 부모에 relative + overflow-hidden 필요 (모션 03) */
export function AuroraBlob({ className = "" }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute animate-drift rounded-full blur-[58px] ${className}`}
    />
  );
}
