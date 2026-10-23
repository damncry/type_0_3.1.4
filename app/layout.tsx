import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'type_0 — монитор системы',
  description: 'Мониторинг ОЗУ и CPU, очистка рабочих наборов и обратимые настройки Windows.',
  icons: { icon: './icon.svg' },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0c0b',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark">
      <body className="font-sans">{children}</body>
    </html>
  )
}
