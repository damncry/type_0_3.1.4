'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Activity, History, LayoutGrid, ListTree, PanelLeft, Settings2, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { spring } from './primitives'
import { useSystem } from './system-provider'

export type PageKey = 'overview' | 'processes' | 'charts' | 'optimize' | 'history' | 'settings'

export const NAV: { key: PageKey; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Обзор', icon: LayoutGrid },
  { key: 'processes', label: 'Процессы', icon: ListTree },
  { key: 'charts', label: 'Графики', icon: Activity },
  { key: 'optimize', label: 'Оптимизация', icon: Sparkles },
  { key: 'history', label: 'История', icon: History },
  { key: 'settings', label: 'Настройки', icon: Settings2 },
]

const labelMotion = {
  initial: { opacity: 0, x: -6 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2, delay: 0.06 } },
  exit: { opacity: 0, x: -6, transition: { duration: 0.1 } },
}

export function Sidebar({
  page,
  onNavigate,
  collapsed,
  onToggle,
}: {
  page: PageKey
  onNavigate: (p: PageKey) => void
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <motion.nav
      aria-label="Основная навигация"
      initial={false}
      animate={{ width: collapsed ? 64 : 216 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="relative z-10 flex shrink-0 flex-col overflow-hidden border-r border-border bg-background/40 px-3 py-4 backdrop-blur-md"
    >
      <ul className="flex flex-col gap-0.5">
        {NAV.map((item, i) => {
          const active = item.key === page
          const Icon = item.icon
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? `${item.label} · Ctrl+${i + 1}` : undefined}
                className={cn(
                  'group relative flex h-9 w-full items-center gap-3 rounded-lg pl-[11px] text-sm transition-colors duration-150',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={spring}
                    className="absolute inset-0 rounded-lg border border-white/[0.06] bg-white/[0.07]"
                  />
                )}
                <span className="absolute inset-0 rounded-lg bg-white/[0.04] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                <Icon className={cn('relative size-[18px] shrink-0 transition-colors', active && 'text-primary')} aria-hidden />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span {...labelMotion} className="relative flex flex-1 items-center justify-between whitespace-nowrap pr-2">
                      {item.label}
                      <kbd className="font-mono text-[10px] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70">
                        {'⌃'}
                        {i + 1}
                      </kbd>
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex-1" />

      <AnimatePresence initial={false}>{!collapsed && <MiniStats />}</AnimatePresence>

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 flex h-9 items-center gap-3 rounded-lg pl-[11px] text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
      >
        <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={spring} className="flex">
          <PanelLeft className="size-[18px]" aria-hidden />
        </motion.span>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span {...labelMotion} className="whitespace-nowrap">
              Свернуть
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </motion.nav>
  )
}

function MiniStats() {
  const { ram, cpu } = useSystem()
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { delay: 0.08 } }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.1 } }}
      className="flex w-[190px] flex-col gap-3 rounded-xl border border-border bg-white/[0.02] p-3"
    >
      <MiniBar label="ОЗУ" value={ram} color="var(--primary)" />
      <MiniBar label="CPU" value={cpu} color="var(--cpu)" />
    </motion.div>
  )
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{value.toFixed(0)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${Math.min(value, 100)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
      </div>
    </div>
  )
}
