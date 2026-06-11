import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ink" | "electric" | "ghost";
  fullWidth?: boolean;
};

export function Button({
  variant = "ink",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  const base =
    "flex h-[56px] select-none items-center justify-center gap-2 rounded-btn px-6 text-[15px] font-bold " +
    "transition-[transform,box-shadow] duration-150 active:scale-[0.965] " +
    "disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    ink: "bg-ink text-white shadow-ink active:shadow-pressed",
    electric: "bg-electric text-white shadow-glow active:shadow-pressed",
    ghost: "bg-transparent font-semibold text-muted shadow-none",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
