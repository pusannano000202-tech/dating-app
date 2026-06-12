import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "ink" | "electric" | "ghost" | "glass";

const BASE =
  "flex h-[56px] select-none items-center justify-center gap-2 rounded-btn px-6 text-[15px] font-bold " +
  "transition-[transform,box-shadow] duration-150 active:scale-[0.965] " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  ink: "bg-ink text-white shadow-ink active:shadow-pressed",
  electric: "bg-electric text-white shadow-glow active:shadow-pressed",
  ghost: "bg-transparent font-semibold text-muted shadow-none",
  glass:
    "border border-[#F2EEE7]/15 bg-[#F2EEE7]/[0.07] text-[#F2EEE7] backdrop-blur-md shadow-none",
};

export function buttonClassName(
  variant: ButtonVariant = "ink",
  fullWidth = false,
  className = ""
) {
  return `${BASE} ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${className}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function Button({
  variant = "ink",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button className={buttonClassName(variant, fullWidth, className)} {...props}>
      {children}
    </button>
  );
}
