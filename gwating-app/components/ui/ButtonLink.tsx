import Link from "next/link";
import { ComponentProps } from "react";
import { buttonClassName, ButtonVariant } from "./Button";

type Props = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function ButtonLink({
  variant = "ink",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <Link className={buttonClassName(variant, fullWidth, className)} {...props}>
      {children}
    </Link>
  );
}
