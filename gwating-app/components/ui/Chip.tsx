import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

export function Chip({
  selected = false,
  className = "",
  children,
  ...props
}: Props) {
  const look = selected
    ? "chip-pop border-[#FF9D7E] bg-[#FFF0EA] text-[#E5402E]"
    : "border-line bg-white text-[#6E675C]";
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`rounded-full border-[1.5px] px-4 py-2 text-xs font-bold transition-colors duration-150 active:scale-95 ${look} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
