'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUp, Power, Search, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatMB, type Proc } from '@/lib/type0/data'
import { useFeedback } from '../feedback'
import { Btn, Card, Checkbox, PageHeader, Segmented, spring } from '../primitives'
import { useSystem } from '../system-provider'

type SortKey = 'name' | 'pid' | 'mem'
type Filter = 'all' | 'heavy' | 'browser'

export function ProcessesPage() {
  const { processes, clean, kill, cleaning } = useSystem()
  const { confirm, toast } = useFeedback()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'mem', dir: -1 })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return processes
      .filter((p) => (filter === 'heavy' ? p.mem >= 300 : filter === 'browser' ? p.browser : true))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q))
      .sort((a, b) => {
        const v = sort.key === 'name' ? a.name.localeCompare(b.name) : a[sort.key] - b[sort.key]
        return v * sort.dir
      })
  }, [processes, query, filter, sort])

  const live = processes.filter((p) => selected.has(p.pid))
  const selectedMem = live.reduce((s, p) => s + p.mem, 0)
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.pid))

  const toggle = (pid: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(pid)) n.delete(pid)
      else n.add(pid)
      return n
    })

  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => r.pid)))

  const setSortKey = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }))

  const cleanSelected = async () => {
    const ok = await confirm({
      title: 'Очистить выбранные?',
      message: `Будут очищены рабочие наборы ${live.length} процессов. Приложения останутся открытыми.`,
      confirmText: 'Очистить',
    })
    if (!ok) return
    try {
      const freed = await clean({ pids: live.map((p) => p.pid) })
      toast({ title: `Освобождено примерно ${formatMB(freed)}`, description: `${live.length} процессов обработано.` })
      setSelected(new Set())
    } catch (error) {
      toast({ title: 'Не удалось очистить выбранные процессы', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  const killSelected = async () => {
    const names = live.slice(0, 5).map((p) => `• ${p.name} (${p.pid})`).join('\n')
    const ok = await confirm({
      title: 'Завершить процессы?',
      message: `${names}${live.length > 5 ? `\n…и ещё ${live.length - 5}` : ''}\n\nНесохранённые данные в этих приложениях будут потеряны.`,
      confirmText: 'Завершить',
      danger: true,
    })
    if (!ok) return
    try {
      const result = await kill(live.map((p) => p.pid))
      if (!result) {
        toast({ title: 'Демо-режим', description: 'Завершение настоящих процессов доступно в установленной Windows-версии.', tone: 'info' })
        setSelected(new Set())
        return
      }
      const successes = result.results.filter((r) => /^(Завершён|Принудительно завершён|Уже закрыт)$/u.test(r.status)).length
      const failed = result.results.length - successes
      const details = result.results.slice(0, 6).map((r) => `${r.name} (${r.pid}): ${r.status}`).join('\n')
      toast({
        title: successes ? `Завершено: ${successes} из ${result.results.length}` : 'Процессы не завершены',
        description: [details, failed ? `Не удалось завершить: ${failed}. Возможно, нужны права администратора.` : ''].filter(Boolean).join('\n'),
        tone: failed ? 'warning' : 'success',
      })
      setSelected(new Set())
    } catch (error) {
      toast({ title: 'Ошибка завершения процессов', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  return (
    <>
      <PageHeader title="Процессы" subtitle="Пользовательские процессы · системные скрыты" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или PID"
            aria-label="Поиск процессов"
            className="h-9 w-full rounded-lg border border-border bg-white/[0.03] pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary/40 focus:bg-white/[0.05] focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Очистить поиск"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
              /
            </kbd>
          )}
        </div>
        <Segmented
          label="Фильтр"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'heavy', label: 'От 300 МБ' },
            { value: 'browser', label: 'Браузеры' },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[28px_1fr_72px_96px] items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground sm:grid-cols-[28px_1fr_80px_150px_100px]">
          <Checkbox checked={allVisibleSelected} onChange={toggleAll} label="Выбрать все" />
          <SortHeader label="Процесс" k="name" sort={sort} onSort={setSortKey} />
          <SortHeader label="PID" k="pid" sort={sort} onSort={setSortKey} />
          <SortHeader label="Память" k="mem" sort={sort} onSort={setSortKey} align="right" className="sm:justify-start" />
          <span className="hidden sm:block">Состояние</span>
        </div>
        <ul className="relative">
          <AnimatePresence initial={false}>
            {rows.map((p) => (
              <ProcessRow key={p.pid} p={p} selected={selected.has(p.pid)} onToggle={() => toggle(p.pid)} />
            ))}
          </AnimatePresence>
        </ul>
        {rows.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">Ничего не найдено</p>}
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        {rows.length} из {processes.length} · процессы с повышенными правами требуют запуска от администратора
      </p>

      <AnimatePresence>
        {live.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={spring}
            className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit items-center gap-2 rounded-2xl border border-border bg-elevated/95 p-1.5 pl-4 shadow-2xl shadow-black/50 backdrop-blur-md"
          >
            <span className="mr-2 text-sm text-foreground">
              Выбрано <span className="font-mono tabular-nums">{live.length}</span>
              <span className="text-muted-foreground"> · {formatMB(selectedMem)}</span>
            </span>
            <Btn variant="primary" size="sm" onClick={cleanSelected} loading={cleaning}>
              {!cleaning && <Zap aria-hidden />}
              Очистить
            </Btn>
            <Btn variant="danger" size="sm" onClick={killSelected}>
              <Power aria-hidden />
              Завершить
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setSelected(new Set())} aria-label="Снять выделение">
              <X aria-hidden />
            </Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align,
  className,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
  align?: 'right'
  className?: string
}) {
  const active = sort.key === k
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={cn(
        'flex items-center gap-1 transition-colors hover:text-foreground',
        active && 'text-foreground',
        align === 'right' && 'justify-end',
        className,
      )}
      aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
    >
      {label}
      {active && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
    </button>
  )
}

function ProcessRow({ p, selected, onToggle }: { p: Proc; selected: boolean; onToggle: () => void }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
      transition={spring}
      onClick={onToggle}
      className={cn(
        'grid cursor-pointer grid-cols-[28px_1fr_72px_96px] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-sm transition-colors duration-150 last:border-0 sm:grid-cols-[28px_1fr_80px_150px_100px]',
        selected ? 'bg-primary/[0.06]' : 'hover:bg-white/[0.025]',
      )}
    >
      <Checkbox checked={selected} onChange={onToggle} label={`Выбрать ${p.name}`} />
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] font-mono text-[10px] uppercase text-muted-foreground">
          {p.name[0]}
        </span>
        <span className="truncate text-foreground">{p.name}</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{p.pid}</span>
      <span className="flex items-center justify-end gap-2.5 sm:justify-start">
        <span className="hidden h-1 w-14 overflow-hidden rounded-full bg-track sm:block">
          <motion.span
            className="block h-full rounded-full bg-primary/70"
            animate={{ width: `${Math.min(100, (p.mem / 800) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        </span>
        <span className="font-mono text-xs tabular-nums text-foreground">{formatMB(p.mem)}</span>
      </span>
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <span className={cn('size-1.5 rounded-full transition-colors', p.status === 'running' ? 'bg-primary' : 'bg-white/25')} />
        {p.status === 'running' ? 'Активен' : 'Ожидание'}
      </span>
    </motion.li>
  )
}
