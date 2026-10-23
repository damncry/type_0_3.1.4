'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Cpu, MemoryStick, RefreshCw, Zap } from 'lucide-react'
import { formatMB, formatRelative } from '@/lib/type0/data'
import { useFeedback } from '../feedback'
import { AnimatedNumber, Btn, Card, CardHeader, PageHeader, Ring, spring } from '../primitives'
import type { PageKey } from '../sidebar'
import { Sparkline } from '../sparkline'
import { useSystem } from '../system-provider'

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
}
const rise = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
}

export function OverviewPage({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const { ram, cpu, usedMB, totalMB, cores, samples } = useSystem()

  return (
    <>
      <PageHeader title="Обзор системы" subtitle="Состояние памяти и быстрые действия" />
      <motion.div variants={stagger} initial="initial" animate="animate" className="grid gap-4 lg:grid-cols-2">
        <motion.div variants={rise}>
          <MetricCard
            icon={<MemoryStick className="size-4" aria-hidden />}
            title="Оперативная память"
            value={ram}
            decimals={1}
            color="var(--primary)"
            values={samples.map((s) => s.ram)}
            rows={[
              ['Используется', `${formatMB(usedMB)} из ${formatMB(totalMB)}`],
              ['Доступно', formatMB(totalMB - usedMB)],
            ]}
          />
        </motion.div>
        <motion.div variants={rise}>
          <MetricCard
            icon={<Cpu className="size-4" aria-hidden />}
            title="Процессор"
            value={cpu}
            color="var(--cpu)"
            values={samples.map((s) => s.cpu)}
            rows={[
              ['Логических ядер', String(cores)],
              ['Пик за сеанс', `${Math.max(...samples.map((s) => s.cpu)).toFixed(0)}%`],
            ]}
          />
        </motion.div>
        <motion.div variants={rise}>
          <QuickActions onNavigate={onNavigate} />
        </motion.div>
        <motion.div variants={rise}>
          <TopProcesses onNavigate={onNavigate} />
        </motion.div>
      </motion.div>
    </>
  )
}

function MetricCard({
  icon,
  title,
  value,
  decimals = 0,
  color,
  values,
  rows,
}: {
  icon: React.ReactNode
  title: string
  value: number
  decimals?: number
  color: string
  values: number[]
  rows: [string, string][]
}) {
  return (
    <Card className="relative h-full overflow-hidden p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span style={{ color }}>{icon}</span>
        <h2 className="text-sm text-foreground">{title}</h2>
      </div>
      <div className="mt-5 flex items-center gap-6">
        <Ring value={value} color={color}>
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            <AnimatedNumber value={value} decimals={decimals} />
            <span className="text-sm text-muted-foreground">%</span>
          </span>
        </Ring>
        <dl className="flex min-w-0 flex-1 flex-col gap-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="truncate font-mono text-sm tabular-nums text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Sparkline values={values} color={color} className="mt-5 h-12 w-full" />
    </Card>
  )
}

function QuickActions({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const { cleaning, clean, log, settings } = useSystem()
  const { confirm, toast } = useFeedback()
  const last = log.find((l) => l.action === 'manual' || l.action === 'auto' || l.action === 'selected')

  const handleClean = async () => {
    const ok = await confirm({
      title: 'Очистить рабочие наборы?',
      message: 'Приложения останутся открытыми. Windows может повторно подгрузить данные и ненадолго притормозить.',
      confirmText: 'Очистить',
    })
    if (!ok) return
    try {
      const freed = await clean()
      toast({ title: `Освобождено примерно ${formatMB(freed)}`, description: 'Рабочие наборы пользовательских процессов обработаны.' })
    } catch (error) {
      toast({ title: 'Не удалось очистить рабочие наборы', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <CardHeader title="Быстрые действия" description="Очистка не завершает приложения." />

      <motion.button
        type="button"
        onClick={handleClean}
        disabled={cleaning}
        whileHover={{ scale: cleaning ? 1 : 1.01 }}
        whileTap={{ scale: 0.98 }}
        transition={spring}
        className="group relative mt-5 flex items-center gap-4 overflow-hidden rounded-xl bg-primary p-4 text-left text-primary-foreground disabled:cursor-wait"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary-foreground/10">
          <motion.span
            animate={cleaning ? { rotate: 360 } : { rotate: 0 }}
            transition={cleaning ? { repeat: Infinity, duration: 1, ease: 'linear' } : spring}
            className="flex"
          >
            {cleaning ? <RefreshCw className="size-5" aria-hidden /> : <Zap className="size-5" aria-hidden />}
          </motion.span>
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">{cleaning ? 'Очищаем…' : 'Очистить рабочие наборы'}</span>
          <span className="text-xs opacity-70">Все пользовательские процессы от {settings.minSize} МБ</span>
        </span>
        {cleaning && (
          <motion.span
            className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '400%' }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
            aria-hidden
          />
        )}
      </motion.button>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="flex flex-col gap-1 rounded-xl border border-border bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.04]"
        >
          <span className="text-xs text-muted-foreground">Автоочистка</span>
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <span className={settings.autoClean ? 'size-1.5 rounded-full bg-primary' : 'size-1.5 rounded-full bg-warning'} />
            {settings.autoClean ? `при ${settings.threshold}%` : 'выключена'}
          </span>
        </button>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-white/[0.02] p-3">
          <span className="text-xs text-muted-foreground">Последняя очистка</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={last?.id ?? 'none'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="truncate text-sm text-foreground"
            >
              {last ? `${formatMB(last.freedMB)} · ${formatRelative(last.at)}` : 'нет данных'}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </Card>
  )
}

function TopProcesses({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const { processes } = useSystem()
  const top = [...processes].sort((a, b) => b.mem - a.mem).slice(0, 6)
  const max = top[0]?.mem ?? 1

  return (
    <Card className="h-full p-5">
      <CardHeader
        title="Самые тяжёлые процессы"
        description="По рабочему набору памяти"
        action={
          <Btn variant="ghost" size="sm" onClick={() => onNavigate('processes')}>
            Все
            <ArrowUpRight aria-hidden />
          </Btn>
        }
      />
      <ul className="mt-4 flex flex-col gap-1">
        {top.map((p) => (
          <motion.li key={p.pid} layout transition={spring} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/[0.05] font-mono text-[11px] uppercase text-muted-foreground">
              {p.name[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-foreground">{p.name.replace(/\.exe$/, '')}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatMB(p.mem)}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-track">
                <motion.div
                  className="h-full rounded-full bg-primary/70"
                  animate={{ width: `${(p.mem / max) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                />
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </Card>
  )
}
