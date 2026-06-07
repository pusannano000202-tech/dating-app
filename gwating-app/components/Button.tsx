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
  const base =
    "h-12 px-6 rounded-md text-base font-extrabold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary:
      "bg-gradient-to-r from-primary to-[#ff7e5f] text-white shadow-btn-primary hover:shadow-[0_6px_24px_rgba(255,90,111,0.35)] hover:-translate-y-px active:translate-y-0",
    secondary:
      "bg-white text-primary border-[1.5px] border-primary-disabled hover:bg-primary-soft active:bg-primary-soft",
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
