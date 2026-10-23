'use client'

import dynamic from 'next/dynamic'

// The app reads live system data and the clock, so it renders on the client only.
const AppShell = dynamic(() => import('./app-shell').then((m) => m.AppShell), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="size-2 animate-pulse rounded-full bg-primary" aria-label="Загрузка" />
    </div>
  ),
})

export function ClientApp() {
  return <AppShell />
}
