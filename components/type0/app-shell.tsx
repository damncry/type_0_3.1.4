'use client'

import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FeedbackProvider } from './feedback'
import { NAV, Sidebar, type PageKey } from './sidebar'
import { SystemProvider, useSystem } from './system-provider'
import { TitleBar } from './title-bar'
import { OverviewPage } from './pages/overview'
import { ProcessesPage } from './pages/processes'
import { ChartsPage } from './pages/charts'
import { OptimizePage } from './pages/optimize'
import { HistoryPage } from './pages/history'
import { SettingsPage } from './pages/settings'

export function AppShell() {
  const [windowMoving, setWindowMoving] = useState(false)
  useEffect(() => {
    const start = () => setWindowMoving(true)
    const end = () => setWindowMoving(false)
    window.addEventListener('type0:window-interaction-start', start)
    window.addEventListener('type0:window-interaction-end', end)
    return () => {
      window.removeEventListener('type0:window-interaction-start', start)
      window.removeEventListener('type0:window-interaction-end', end)
    }
  }, [])

  return (
    <MotionConfig reducedMotion={windowMoving ? 'always' : 'user'}>
      <SystemProvider>
        <FeedbackProvider>
          <Shell />
        </FeedbackProvider>
      </SystemProvider>
    </MotionConfig>
  )
}

function Shell() {
  const [page, setPage] = useState<PageKey>('overview')
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 900)
  const mainRef = useRef<HTMLElement>(null)

  const navigate = useCallback((key: PageKey) => {
    setPage(key)
    mainRef.current?.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < NAV.length) {
        e.preventDefault()
        navigate(NAV[idx].key)
      }
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setCollapsed((c) => !c)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <Backdrop />
      <TitleBar onToggleSidebar={() => setCollapsed((c) => !c)} />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar page={page} onNavigate={navigate} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <main ref={mainRef} className="t0-scroll min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-5 pb-10 pt-6 md:px-8 lg:px-10 lg:pt-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <PageView page={page} onNavigate={navigate} />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

function PageView({ page, onNavigate }: { page: PageKey; onNavigate: (p: PageKey) => void }) {
  switch (page) {
    case 'overview':
      return <OverviewPage onNavigate={onNavigate} />
    case 'processes':
      return <ProcessesPage />
    case 'charts':
      return <ChartsPage />
    case 'optimize':
      return <OptimizePage />
    case 'history':
      return <HistoryPage />
    case 'settings':
      return <SettingsPage />
  }
}

function Backdrop() {
  const { wallpaper, settings } = useSystem()
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <AnimatePresence>
        {wallpaper ? (
          <motion.div
            key={wallpaper}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user-selected local object URL */}
            <img src={wallpaper} alt="" className="size-full object-cover" />
            <div className="absolute inset-0 bg-background transition-opacity duration-300" style={{ opacity: settings.dim / 100 }} />
          </motion.div>
        ) : (
          <motion.div
            key="default"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background:
                'radial-gradient(60% 50% at 0% 0%, rgb(134 214 164 / 0.07), transparent 70%), radial-gradient(40% 40% at 100% 100%, rgb(143 179 255 / 0.04), transparent 70%)',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
