import { useId } from "react";

type Props = {
  size?: number;
  variant?: "ink" | "electric" | "white";
  className?: string;
};

export function BoltLogo({ size = 24, variant = "ink", className = "" }: Props) {
  const gradientId = useId();
  const fill =
    variant === "electric"
      ? `url(#${gradientId})`
      : variant === "white"
        ? "#FFFFFF"
        : "#1B1916";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      {variant === "electric" && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF3D5A" />
            <stop offset="1" stopColor="#FF7A3D" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M13 2L4.5 13.5h5.5L9 22l8.5-11.5H12L13 2z"
        fill={fill}
      />
    </svg>
  );
}
