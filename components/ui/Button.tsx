import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'ink' | 'gradient' | 'soft' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

type SharedProps = {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}

type ButtonProps = SharedProps & ButtonHTMLAttributes<HTMLButtonElement>
type ButtonLinkProps = SharedProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

const variants: Record<ButtonVariant, string> = {
  ink: 'bg-boot-ink text-white shadow-sm hover:opacity-95',
  gradient: 'btn-gradient-animated text-white',
  soft: 'border border-boot-primary/20 bg-boot-soft text-boot-primary shadow-sm hover:border-boot-primary/35',
  ghost: 'border border-boot-hairline bg-white/85 text-boot-body shadow-sm hover:border-boot-primary/30',
  danger: 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 rounded-2xl px-3 text-xs',
  md: 'h-12 rounded-2xl px-4 text-sm',
  lg: 'h-14 rounded-[22px] px-5 text-base',
}

export function buttonClassName({
  variant = 'ink',
  size = 'md',
  fullWidth = false,
  className = '',
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}): string {
  return [
    'inline-flex items-center justify-center gap-2 font-black transition disabled:pointer-events-none disabled:opacity-40',
    variants[variant],
    sizes[size],
    fullWidth ? 'w-full' : '',
    className,
  ].filter(Boolean).join(' ')
}

export function Button({
  children,
  variant = 'ink',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      {children}
    </button>
  )
}

export function ButtonLink({
  children,
  variant = 'ink',
  size = 'md',
  fullWidth = false,
  className = '',
  href,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      {children}
    </Link>
  )
}
