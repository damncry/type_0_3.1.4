'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { areaPath, smoothPath, toPoints } from '@/lib/type0/chart'
import { AnimatedNumber, Card, PageHeader, Segmented } from '../primitives'
import { useSystem } from '../system-provider'

const W = 800
const H = 260

type SeriesKey = 'ram' | 'cpu'
const SERIES: Record<SeriesKey, { label: string; color: string }> = {
  ram: { label: 'ОЗУ', color: 'var(--primary)' },
  cpu: { label: 'CPU', color: 'var(--cpu)' },
}

export function ChartsPage() {
  const { samples, settings } = useSystem()
  const [range, setRange] = useState<60 | 120 | 180>(60)
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({ ram: true, cpu: true })
  const [hover, setHover] = useState<number | null>(null)

  const data = samples.slice(-range)
  const offsetSlots = range - data.length
  const step = W / (range - 1)

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round(x / step) - offsetSlots
    setHover(idx >= 0 && idx < data.length ? idx : null)
  }

  const hoverSample = hover !== null ? data[hover] : null
  const hoverX = hover !== null ? ((offsetSlots + hover) * step) / W : 0
  const seconds = range * settings.interval

  return (
    <>
      <PageHeader
        title="Графики"
        subtitle="История загрузки за текущий запуск"
        actions={
          <Segmented
            label="Период"
            value={range}
            onChange={setRange}
            options={[
              { value: 60, label: `${(60 * settings.interval) / 60} мин` },
              { value: 120, label: `${(120 * settings.interval) / 60} мин` },
              { value: 180, label: `${(180 * settings.interval) / 60} мин` },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {(Object.keys(SERIES) as SeriesKey[]).map((k) => (
          <StatCard
            key={k}
            k={k}
            values={data.map((s) => s[k])}
            active={visible[k]}
            onToggle={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
          />
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Последние {Math.round(seconds / 60)} мин · шаг {settings.interval} с</span>
          <span>{data.length} измерений</span>
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col justify-between py-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground" style={{ height: H }}>
            {[100, 75, 50, 25, 0].map((v) => (
              <span key={v} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
                {v}
              </span>
            ))}
          </div>
          <div
            className="relative flex-1 touch-none"
            style={{ height: H }}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`График ОЗУ и CPU. Сейчас ОЗУ ${data.at(-1)?.ram.toFixed(0)}%, CPU ${data.at(-1)?.cpu.toFixed(0)}%`}
          >
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border-t border-dashed border-white/[0.06]" />
              ))}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <defs>
                {(Object.keys(SERIES) as SeriesKey[]).map((k) => (
                  <linearGradient key={k} id={`chart-${k}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[k].color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={SERIES[k].color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              {(Object.keys(SERIES) as SeriesKey[]).map((k) => {
                const pts = toPoints(
                  data.map((s) => s[k]),
                  W,
                  H,
                  range,
                )
                return (
                  <motion.g key={k} initial={false} animate={{ opacity: visible[k] ? 1 : 0 }} transition={{ duration: 0.25 }}>
                    <path d={areaPath(pts, H)} fill={`url(#chart-${k})`} />
                    <path d={smoothPath(pts)} fill="none" stroke={SERIES[k].color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
                  </motion.g>
                )
              })}
            </svg>

            <AnimatePresence>
              {hoverSample && (
                <motion.div
                  className="pointer-events-none absolute inset-y-0"
                  style={{ left: `${hoverX * 100}%` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <div className="absolute inset-y-0 w-px bg-white/15" />
                  {(Object.keys(SERIES) as SeriesKey[]).map(
                    (k) =>
                      visible[k] && (
                        <span
                          key={k}
                          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
                          style={{ top: `${100 - hoverSample[k]}%`, background: SERIES[k].color, left: 0.5 }}
                        />
                      ),
                  )}
                  <div
                    className={cn(
                      'absolute top-2 flex min-w-28 flex-col gap-1 rounded-lg border border-border bg-elevated/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md',
                      hoverX > 0.75 ? 'right-3' : 'left-3',
                    )}
                  >
                    <span className="text-muted-foreground">
                      {Math.round((data.length - 1 - (hover ?? 0)) * settings.interval)} с назад
                    </span>
                    {(Object.keys(SERIES) as SeriesKey[]).map(
                      (k) =>
                        visible[k] && (
                          <span key={k} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-foreground">
                              <span className="size-1.5 rounded-full" style={{ background: SERIES[k].color }} />
                              {SERIES[k].label}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">{hoverSample[k].toFixed(1)}%</span>
                          </span>
                        ),
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Хранится до 180 измерений за запуск. Это не измерение FPS.</p>
    </>
  )
}

function StatCard({ k, values, active, onToggle }: { k: SeriesKey; values: number[]; active: boolean; onToggle: () => void }) {
  const cur = values.at(-1) ?? 0
  const avg = values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1)
  const peak = Math.max(...values)
  const low = Math.min(...values)
  const { label, color } = SERIES[k]

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'rounded-2xl border border-border bg-card/90 p-4 text-left transition-[opacity,background-color] duration-200 hover:bg-elevated',
        !active && 'opacity-45',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-foreground">
          <span className="size-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{active ? 'Показан' : 'Скрыт'}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <span className="text-3xl font-semibold tracking-tight text-foreground">
          <AnimatedNumber value={cur} decimals={1} />
          <span className="text-base text-muted-foreground">%</span>
        </span>
        <dl className="flex gap-4 text-right">
          {[
            ['Сред.', avg],
            ['Пик', peak],
            ['Мин.', low],
          ].map(([l, v]) => (
            <div key={l as string}>
              <dt className="text-[11px] text-muted-foreground">{l}</dt>
              <dd className="font-mono text-xs tabular-nums text-foreground">{(v as number).toFixed(0)}%</dd>
            </div>
          ))}
        </dl>
      </div>
    </button>
  )
}
