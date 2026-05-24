type Props = { reasons: string[] };

export function MatchReasonList({ reasons }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {reasons.map((r, i) => (
        <li key={i} className="flex gap-2 text-sm text-sky-ink bg-sky rounded-md px-3 py-2">
          <span className="shrink-0">✦</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}
