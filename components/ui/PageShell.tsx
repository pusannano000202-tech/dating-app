import type { ReactNode } from 'react'

type PageShellProps = {
  children: ReactNode
  className?: string
  innerClassName?: string
  withBottomNavSpace?: boolean
}

export function PageShell({
  children,
  className = '',
  innerClassName = '',
  withBottomNavSpace = false,
}: PageShellProps) {
  return (
    <main
      className={[
        'min-h-screen booting-band px-5 pt-7 text-boot-ink',
        withBottomNavSpace ? 'pb-28' : 'pb-12',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className={['mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md', innerClassName].filter(Boolean).join(' ')}>
        {children}
      </div>
    </main>
  )
}
