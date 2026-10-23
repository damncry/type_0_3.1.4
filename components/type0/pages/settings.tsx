'use client'

import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, ImageIcon, Rocket, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDuration, PROFILE_KEYS, PROFILES, type ProfileKey } from '@/lib/type0/data'
import { useFeedback } from '../feedback'
import { Btn, Card, CardHeader, PageHeader, Segmented, Slider, Switch, spring } from '../primitives'
import { useSystem, type Settings } from '../system-provider'

const withoutDim = ({ dim: _dim, ...rest }: Settings) => JSON.stringify(rest)

export function SettingsPage() {
  const { settings, saveSettings, openFolder } = useSystem()
  const { toast } = useFeedback()
  const [draft, setDraft] = useState<Settings>(settings)
  const dirty = withoutDim(draft) !== withoutDim(settings)

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const pickProfile = (p: ProfileKey) =>
    setDraft((d) => ({ ...d, profile: p, threshold: PROFILES[p].threshold, pause: PROFILES[p].pause, minSize: PROFILES[p].minSize }))

  const save = async () => {
    try {
      await saveSettings({ ...draft, dim: settings.dim })
      toast({ title: 'Настройки сохранены' })
    } catch (error) {
      toast({ title: 'Не удалось сохранить настройки', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  const openPath = async (kind: 'data' | 'program' | 'startup') => {
    try { await openFolder(kind) }
    catch (error) { toast({ title: 'Не удалось открыть папку', description: error instanceof Error ? error.message : String(error), tone: 'warning' }) }
  }

  const profile = PROFILES[draft.profile]
  const customised =
    draft.threshold !== profile.threshold || draft.pause !== profile.pause || draft.minSize !== profile.minSize

  return (
    <>
      <PageHeader title="Настройки" subtitle="Профили, автоочистка и поведение приложения" />

      <Card className="mb-4 p-5">
        <CardHeader
          title="Профиль"
          description={customised ? `${profile.label} · изменён вручную` : profile.desc}
        />
        <div role="radiogroup" aria-label="Профиль" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PROFILE_KEYS.map((k) => {
            const active = draft.profile === k
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pickProfile(k)}
                className={cn(
                  'relative flex flex-col items-start gap-1 rounded-xl border border-border px-3 py-2.5 text-left transition-colors duration-150',
                  active ? 'text-foreground' : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="profile-active"
                    transition={spring}
                    className="absolute inset-0 rounded-xl border border-primary/40 bg-primary/[0.07]"
                  />
                )}
                <span className="relative text-sm font-medium">{PROFILES[k].label}</span>
                <span className="relative font-mono text-[11px] tabular-nums text-muted-foreground">
                  {PROFILES[k].threshold}% · {formatDuration(PROFILES[k].pause)}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader
            title="Автоочистка"
            description="Срабатывает при превышении порога ОЗУ"
            action={<Switch checked={draft.autoClean} onCheckedChange={(v) => set('autoClean', v)} label="Включить автоочистку" />}
          />
          <motion.div
            initial={false}
            animate={{ opacity: draft.autoClean ? 1 : 0.4 }}
            transition={{ duration: 0.2 }}
            className={cn('mt-5 flex flex-col gap-5', !draft.autoClean && 'pointer-events-none')}
            aria-disabled={!draft.autoClean}
          >
            <Slider label="Порог ОЗУ" value={draft.threshold} min={50} max={98} onChange={(v) => set('threshold', v)} format={(v) => `${v}%`} />
            <Slider
              label="Пауза между очистками"
              value={draft.pause}
              min={30}
              max={900}
              step={30}
              onChange={(v) => set('pause', v)}
              format={formatDuration}
            />
            <Slider
              label="Минимальный размер процесса"
              value={draft.minSize}
              min={20}
              max={500}
              step={10}
              onChange={(v) => set('minSize', v)}
              format={(v) => `${v} МБ`}
            />
          </motion.div>
          <div className="mt-5 flex flex-col divide-y divide-border border-t border-border">
            <ToggleRow label="Очищать браузеры" hint="Chrome, Edge, Firefox и др." checked={draft.browsers} onChange={(v) => set('browsers', v)} />
            <ToggleRow label="Игровой режим" hint="Пауза автоочистки при запущенной игре" checked={draft.gameMode} onChange={(v) => set('gameMode', v)} />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <CardHeader title="Запуск и окно" />
            <div className="mt-2 flex flex-col divide-y divide-border">
              <ToggleRow label="Запускать вместе с Windows" checked={draft.autostart} onChange={(v) => set('autostart', v)} />
              <ToggleRow label="Запускать свёрнутым" checked={draft.startMinimized} onChange={(v) => set('startMinimized', v)} />
              <ToggleRow label="Сворачивать в трей при закрытии" checked={draft.tray} onChange={(v) => set('tray', v)} />
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm text-foreground">Обновление данных</span>
                <Segmented
                  label="Интервал обновления"
                  size="sm"
                  value={draft.interval}
                  onChange={(v) => set('interval', v)}
                  options={[1, 2, 3, 5].map((v) => ({ value: v as Settings['interval'], label: `${v} с` }))}
                />
              </div>
            </div>
          </Card>
          <AppearanceCard />
          <Card className="p-5">
            <CardHeader title="Данные" description="%APPDATA%\type_0" />
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn size="sm" onClick={() => void openPath('data')}>
                <FolderOpen aria-hidden />
                Папка данных
              </Btn>
              <Btn size="sm" onClick={() => void openPath('program')}>
                <FolderOpen aria-hidden />
                Папка программы
              </Btn>
              <Btn size="sm" onClick={() => void openPath('startup')}>
                <Rocket aria-hidden />
                Автозагрузка
              </Btn>
            </div>
          </Card>
        </div>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={spring}
            className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit items-center gap-3 rounded-2xl border border-border bg-elevated/95 p-1.5 pl-4 shadow-2xl shadow-black/50 backdrop-blur-md"
          >
            <span className="flex items-center gap-2 text-sm text-foreground">
              <span className="size-1.5 rounded-full bg-warning" />
              Есть несохранённые изменения
            </span>
            <Btn variant="ghost" size="sm" onClick={() => setDraft(settings)}>
              Сбросить
            </Btn>
            <Btn variant="primary" size="sm" onClick={save}>
              Сохранить
            </Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  )
}

function AppearanceCard() {
  const { wallpaper, setWallpaper, settings, saveSettings, previewSettings } = useSystem()
  const { toast } = useFeedback()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dimDraft, setDimDraft] = useState(settings.dim)

  useEffect(() => setDimDraft(settings.dim), [settings.dim])

  const chooseImage = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: 'Файл слишком большой', description: 'Выбери изображение до 25 МБ.', tone: 'warning' })
      return
    }
    const reader = new FileReader()
    reader.onerror = () => toast({ title: 'Не удалось прочитать файл', tone: 'warning' })
    reader.onload = async () => {
      try {
        if (typeof reader.result !== 'string') throw new Error('Не удалось прочитать изображение.')
        await setWallpaper(reader.result, file.name)
        toast({ title: 'Фон сохранён', description: file.name })
      } catch (error) {
        toast({ title: 'Не удалось установить фон', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
      }
    }
    reader.readAsDataURL(file)
  }

  const resetWallpaper = async () => {
    try {
      await setWallpaper(null)
      toast({ title: 'Стандартный фон восстановлен' })
    } catch (error) {
      toast({ title: 'Не удалось сбросить фон', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  const commitDim = async () => {
    try {
      await saveSettings({ ...settings, dim: dimDraft })
    } catch (error) {
      toast({ title: 'Не удалось сохранить оформление', description: error instanceof Error ? error.message : String(error), tone: 'warning' })
    }
  }

  return (
    <Card className="p-5">
      <CardHeader title="Оформление" description="Фон применяется ко всему окну приложения" />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
          aria-label="Выбрать фоновое изображение"
        >
          {wallpaper ? (
            // eslint-disable-next-line @next/next/no-img-element -- local app-owned wallpaper URL
            <img src={wallpaper} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <ImageIcon className="size-4" aria-hidden />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm text-foreground">Фоновое изображение</p>
          <p className="text-xs text-muted-foreground">{wallpaper ? 'Пользовательское изображение' : 'Используется стандартный фон'}</p>
          <div className="flex flex-wrap gap-1">
            <Btn size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
              Выбрать изображение
            </Btn>
            {wallpaper && (
              <Btn size="sm" variant="ghost" onClick={() => void resetWallpaper()}>
                <X aria-hidden />
                Сбросить
              </Btn>
            )}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) chooseImage(file)
            e.target.value = ''
          }}
        />
      </div>
      <AnimatePresence initial={false}>
        {wallpaper && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-5">
              <Slider
                label="Затемнение"
                value={dimDraft}
                min={0}
                max={90}
                onChange={(v) => {
                  setDimDraft(v)
                  previewSettings({ ...settings, dim: v })
                }}
                onCommit={() => void commitDim()}
                format={(v) => `${v}%`}
              />
              <p className="mt-1 text-xs text-muted-foreground">Больше затемнение — лучше читаемость. Значение сохраняется после отпускания ползунка.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
