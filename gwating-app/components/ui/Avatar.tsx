const PALETTES = [
  "from-[#FF3D5A] to-[#FF7A3D]",
  "from-[#7B6CFF] to-[#C9B8FF]",
  "from-[#2EB8A5] to-[#8CE8B4]",
];

type Props = {
  label?: string;
  frost?: boolean;
  paletteIndex?: number;
  className?: string;
};

export function Avatar({
  label = "?",
  frost = false,
  paletteIndex = 0,
  className = "",
}: Props) {
  if (frost) {
    return (
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-white bg-gradient-to-br from-[#EFE9E0] to-[#E2D9CC] text-sm font-extrabold text-[#B4AB9D] blur-[0.4px] ${className}`}
      >
        ?
      </span>
    );
  }
  const palette = PALETTES[paletteIndex % PALETTES.length];
  return (
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${palette} text-sm font-extrabold text-white ${className}`}
    >
      {label}
    </span>
  );
}
