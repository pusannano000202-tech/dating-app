type Props = { reasons: string[] };

export function MatchReasonList({ reasons }: Props) {
  return (
    <ul className="flex flex-col gap-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-body leading-snug">
          <span className="text-primary shrink-0 mt-0.5">✓</span>
          {r}
        </li>
      ))}
    </ul>
  );
}
