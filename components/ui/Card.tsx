import type { ElementType, HTMLAttributes, ReactNode } from 'react'

type CardVariant = 'plain' | 'glass' | 'soft' | 'dark'

type CardProps<T extends ElementType = 'section'> = HTMLAttributes<HTMLElement> & {
  as?: T
  children: ReactNode
  variant?: CardVariant
  interactive?: boolean
}

const variants: Record<CardVariant, string> = {
  plain: 'border-boot-hairline bg-white shadow-sm',
  glass: 'border-boot-hairline bg-white/88 shadow-sm backdrop-blur',
  soft: 'border-boot-primary/15 bg-boot-soft shadow-sm',
  dark: 'border-transparent bg-boot-ink text-white shadow-sm',
}

export function Card<T extends ElementType = 'section'>({
  as,
  children,
  variant = 'plain',
  interactive = false,
  className = '',
  ...props
}: CardProps<T>) {
  const Component = as ?? 'section'

  return (
    <Component
      className={[
        'rounded-[28px] border p-5',
        variants[variant],
        interactive ? 'transition hover:-translate-y-0.5 hover:border-boot-primary/35 hover:shadow-md' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </Component>
  )
}
