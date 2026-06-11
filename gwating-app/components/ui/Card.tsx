import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: "light" | "dark" | "glass";
  pressable?: boolean;
};

export function Card({
  variant = "light",
  pressable = false,
  className = "",
  children,
  ...props
}: Props) {
  const variants = {
    light: "border border-line bg-white shadow-card",
    dark: "bg-gradient-to-br from-[#26211C] to-[#1B1916] text-[#F2EEE7] shadow-ink",
    glass:
      "border border-[#F2EEE7]/10 bg-[#F2EEE7]/[0.06] text-[#F2EEE7] backdrop-blur-md",
  };
  const press = pressable
    ? "cursor-pointer transition-[transform,box-shadow] duration-150 active:scale-[0.97] active:shadow-pressed"
    : "";
  return (
    <div
      className={`rounded-card p-5 ${variants[variant]} ${press} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
