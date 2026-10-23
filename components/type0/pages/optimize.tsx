'use client'

import { AnimatePresence, motion } from 'motion/react'
import { HardDrive, RotateCcw, Settings2, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatMB, TWEAKS, type TweakId } from '@/lib/type0/data'
import { useFeedback } from '../feedback'
import { Btn, Card, CardHeader, PageHeader, Switch } from '../primitives'
import { useSystem } from '../system-provider'

export function OptimizePage() {
  const { appliedTweaks, setAppliedTweaks, cleanTemp, openDiskCleanup, openWindowsSetting } = useSystem()
  const { confirm, toast } = useFeedback()
  const [selected, setSelected] = useState<TweakId[]>(appliedTweaks)
  const [tempBusy, setTempBusy] = useState(false)

  const same = selected.length === appliedTweaks.length && selected.every((s) => appliedTweaks.includes(s))
  const toggle = (id: TweakId) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const apply = async () => {
    const ok = await confirm({
      title: 'Применить параметры?',
      message: 'Перед изменением будет создана резервная копия реестра. Некоторые параметры вступят в силу после повторного входа в Windows.',
      confirmText: 'Применить',
    })
    if (!ok) return
    try {
      await setAppliedTweaks(selected, 'Применены параметры Windows')
      toast({ title: 'Параметры применены', description: 'Резервная копия сохранена.' })
    } catch (error) {
      toast({ title: 'Не удалось применить параметры', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  const restore = async () => {
    const ok = await confirm({
      title: 'Восстановить исходные значения?',
      message: 'Все параметры, изменённые type_0, будут возвращены из резервной копии.',
      confirmText: 'Восстановить',
      danger: true,
    })
    if (!ok) return
    try {
      await setAppliedTweaks([], 'Восстановлены значения реестра')
      setSelected([])
      toast({ title: 'Исходные значения восстановлены', tone: 'info' })
    } catch (error) {
      toast({ title: 'Не удалось восстановить значения', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  const runTemp = async () => {
    setTempBusy(true)
    try {
      const freed = await cleanTemp()
      toast({ title: `Удалено примерно ${formatMB(freed)}`, description: 'Занятые и недоступные файлы пропущены.' })
    } catch (error) {
      toast({ title: 'Не удалось очистить временные файлы', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    } finally {
      setTempBusy(false)
    }
  }

  const openSetting = async (uri: string, label: string) => {
    try {
      await openWindowsSetting(uri)
      toast({ title: `Открываем: ${label}`, tone: 'info' })
    } catch (error) {
      toast({ title: `Не удалось открыть: ${label}`, description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  const quickSettings = [
    { label: 'Игровой режим', uri: 'ms-settings:gaming-gamemode' },
    { label: 'Xbox Game Bar', uri: 'ms-settings:gaming-gamebar' },
    { label: 'Графика и HAGS', uri: 'ms-settings:display-advancedgraphics' },
    { label: 'Цвета и прозрачность', uri: 'ms-settings:personalization-colors' },
    { label: 'Мышь', uri: 'ms-settings:mouse' },
    { label: 'Хранилище', uri: 'ms-settings:storagesense' },
    { label: 'Безопасность Windows', uri: 'windowsdefender:' },
  ]

  return (
    <>
      <PageHeader title="Оптимизация" subtitle="Обратимые настройки Windows для текущего пользователя" />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <CardHeader
            title="Параметры Windows"
            description={`${appliedTweaks.length} из ${TWEAKS.length} активно`}
            action={
              <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                <ShieldCheck className="size-3.5" aria-hidden />
                С резервной копией
              </span>
            }
          />
          <ul className="mt-4 flex flex-col gap-2">
            {TWEAKS.map((t) => {
              const on = selected.includes(t.id)
              const active = appliedTweaks.includes(t.id)
              return (
                <li key={t.id}>
                  <div
                    onClick={() => toggle(t.id)}
                    className={cn(
                      'flex cursor-pointer items-start gap-4 rounded-xl border p-3.5 transition-colors duration-200',
                      on ? 'border-primary/25 bg-primary/[0.04]' : 'border-border bg-white/[0.015] hover:bg-white/[0.03]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-foreground">{t.title}</span>
                        <AnimatePresence>
                          {active && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="rounded-md bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                            >
                              Активно
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
                    </div>
                    <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                      <Switch checked={on} onCheckedChange={() => toggle(t.id)} label={t.title} />
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Btn variant="ghost" onClick={restore} disabled={appliedTweaks.length === 0}>
              <RotateCcw aria-hidden />
              Восстановить исходные
            </Btn>
            <div className="flex items-center gap-3">
              <AnimatePresence>
                {!same && (
                  <motion.span
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="text-xs text-warning"
                  >
                    Есть изменения
                  </motion.span>
                )}
              </AnimatePresence>
              <Btn variant="primary" onClick={apply} disabled={same}>
                Применить
              </Btn>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <CardHeader title="Обслуживание" description="Файлы, которые можно удалить без последствий" />
            <div className="mt-4 flex flex-col gap-2">
              <MaintenanceRow
                icon={<Trash2 className="size-4" aria-hidden />}
                title="Временные файлы"
                desc="Пользовательская папка TEMP"
                action={
                  <Btn size="sm" onClick={runTemp} loading={tempBusy}>
                    Очистить
                  </Btn>
                }
              />
              <MaintenanceRow
                icon={<HardDrive className="size-4" aria-hidden />}
                title="Очистка диска"
                desc="Системная утилита cleanmgr"
                action={
                  <Btn size="sm" onClick={async () => {
                    try {
                      await openDiskCleanup()
                      toast({ title: 'Открываем «Очистку диска»', tone: 'info' })
                    } catch (error) {
                      toast({ title: 'Не удалось открыть «Очистку диска»', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
                    }
                  }}>
                    Открыть
                  </Btn>
                }
              />
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="Быстрые переходы Windows" description="Открывают штатные страницы настроек без скрытых изменений." />
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quickSettings.map((setting) => (
                <Btn key={setting.uri} size="sm" variant="secondary" className="justify-start" onClick={() => void openSetting(setting.uri, setting.label)}>
                  <Settings2 aria-hidden />
                  {setting.label}
                </Btn>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="Резервная копия" description="Создаётся автоматически перед первым изменением" />
            <code className="mt-3 block truncate rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
              %APPDATA%\type_0\registry_backup.json
            </code>
          </Card>
        </div>
      </div>
    </>
  )
}

function MaintenanceRow({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.015] p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {action}
    </div>
  )
}
