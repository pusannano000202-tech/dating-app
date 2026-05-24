import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  const base = "h-12 px-6 rounded-sm text-base font-semibold transition-colors disabled:opacity-50";
  const variants = {
    primary:   "bg-primary text-white hover:bg-primary-active",
    secondary: "bg-white text-ink border border-hairline hover:bg-surface-soft",
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
