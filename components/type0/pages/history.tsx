'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Bot, Download, FileX, Hand, ListChecks, Power, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { formatMB } from '@/lib/type0/data'
import { useFeedback } from '../feedback'
import { Btn, Card, PageHeader, Segmented, spring } from '../primitives'
import { useSystem, type LogAction, type LogEntry } from '../system-provider'

type Filter = 'all' | 'clean' | 'other'

const ACTION_META: Record<LogAction, { icon: LucideIcon; label: string }> = {
  manual: { icon: Hand, label: 'Вручную' },
  auto: { icon: Bot, label: 'Авто' },
  selected: { icon: ListChecks, label: 'Выбранные' },
  temp: { icon: FileX, label: 'TEMP' },
  kill: { icon: Power, label: 'Завершение' },
  tweak: { icon: SlidersHorizontal, label: 'Реестр' },
}

const isClean = (a: LogAction) => a === 'manual' || a === 'auto' || a === 'selected'

export function HistoryPage() {
  const { log } = useSystem()
  const { toast } = useFeedback()
  const [filter, setFilter] = useState<Filter>('all')

  const rows = log.filter((l) => (filter === 'all' ? true : filter === 'clean' ? isClean(l.action) : !isClean(l.action)))
  const cleans = log.filter((l) => isClean(l.action))
  const totalFreed = log.reduce((s, l) => s + (l.action === 'tweak' ? 0 : l.freedMB), 0)

  const exportCsv = () => {
    const head = 'time,action,title,freed_mb,ram_before,ram_after,details'
    const body = log
      .map((l) =>
        [new Date(l.at).toISOString(), l.action, l.title, l.freedMB.toFixed(1), l.before.toFixed(1), l.after.toFixed(1), l.details]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n')
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'type0-history.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'История экспортирована', description: 'type0-history.csv' })
  }

  return (
    <>
      <PageHeader
        title="История действий"
        subtitle="Очистки, изменения настроек и завершённые процессы"
        actions={
          <Btn onClick={exportCsv} disabled={log.length === 0}>
            <Download aria-hidden />
            Экспорт CSV
          </Btn>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Всего освобождено" value={formatMB(totalFreed)} />
        <Stat label="Очисток памяти" value={String(cleans.length)} />
        <Stat
          label="В среднем за очистку"
          value={cleans.length ? formatMB(cleans.reduce((s, l) => s + l.freedMB, 0) / cleans.length) : '—'}
        />
      </div>

      <div className="mb-3 flex justify-end">
        <Segmented
          label="Тип"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'clean', label: 'Очистки' },
            { value: 'other', label: 'Прочее' },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        <ul>
          <AnimatePresence initial={false}>
            {rows.map((l) => (
              <Row key={l.id} l={l} />
            ))}
          </AnimatePresence>
        </ul>
        {rows.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">Записей пока нет</p>}
      </Card>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mt-1 font-mono text-lg tabular-nums text-foreground"
        >
          {value}
        </motion.p>
      </AnimatePresence>
    </Card>
  )
}

function Row({ l }: { l: LogEntry }) {
  const { icon: Icon, label } = ACTION_META[l.action]
  const showRam = isClean(l.action) || l.action === 'kill'
  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={spring}
      className="overflow-hidden border-b border-border/60 last:border-0"
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-foreground">{l.title}</span>
            <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-muted-foreground">{label}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{l.details}</p>
        </div>
        <div className="hidden text-right sm:block">
          {showRam && (
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {l.before.toFixed(1)}% {'→'} {l.after.toFixed(1)}%
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/70">
            {new Date(l.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-primary">
          {l.freedMB > 0 ? `−${formatMB(l.freedMB)}` : ''}
        </span>
      </div>
    </motion.li>
  )
}
