'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Minus, Square, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useFeedback } from './feedback'
import { useSystem } from './system-provider'
import { getDesktopApi } from '@/lib/type0/native-api'

export function TitleBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { cleaning, settings, isDesktop, windowMinimize, windowToggleMaximize, windowClose } = useSystem()
  const { toast } = useFeedback()
  const [maximized, setMaximized] = useState(false)
  const dragActiveRef = useRef(false)
  const dragFailsafeRef = useRef<number | null>(null)
  const finishWindowMove = useCallback(() => {
    if (!dragActiveRef.current) return
    dragActiveRef.current = false
    if (dragFailsafeRef.current !== null) {
      window.clearTimeout(dragFailsafeRef.current)
      dragFailsafeRef.current = null
    }
    document.documentElement.classList.remove('type0-window-moving')
    window.dispatchEvent(new Event('type0:window-interaction-end'))
    const api = getDesktopApi()
    if (api) void api.set_window_interacting(false).catch(() => undefined)
  }, [])
  const beginWindowMove = useCallback(() => {
    if (dragActiveRef.current) return
    dragActiveRef.current = true
    document.documentElement.classList.add('type0-window-moving')
    window.dispatchEvent(new Event('type0:window-interaction-start'))
    const api = getDesktopApi()
    if (api) void api.set_window_interacting(true).catch(() => undefined)
    // Certain WebView2 versions do not forward mouseup after the OS title-bar move.
    // This failsafe makes sure telemetry can never remain paused indefinitely.
    dragFailsafeRef.current = window.setTimeout(finishWindowMove, 15000)
  }, [finishWindowMove])
  useEffect(() => {
    window.addEventListener('pointerup', finishWindowMove, true)
    window.addEventListener('mouseup', finishWindowMove, true)
    window.addEventListener('pointercancel', finishWindowMove, true)
    return () => {
      window.removeEventListener('pointerup', finishWindowMove, true)
      window.removeEventListener('mouseup', finishWindowMove, true)
      window.removeEventListener('pointercancel', finishWindowMove, true)
      finishWindowMove()
    }
  }, [finishWindowMove])
  const status = !isDesktop ? 'Предпросмотр' : cleaning ? 'Очистка…' : settings.autoClean ? 'Автоочистка включена' : 'Работает'
  const action = async (fn: () => Promise<unknown>, title: string) => {
    try { await fn() } catch (error) { toast({ title, description: error instanceof Error ? error.message : String(error), tone: 'warning' }) }
  }

  return (
    <div className="relative z-10 flex h-11 shrink-0 items-center gap-3 border-b border-border bg-background/70 pl-3 backdrop-blur-md">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-white/[0.04]"
        aria-label="Свернуть или развернуть меню (Ctrl+B)"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 font-mono text-base font-semibold text-primary shadow-[inset_0_0_0_1px_rgb(134_214_164_/_0.05)]">
          T
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">type_0</span>
        <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">3.1.4</span>
      </button>

      <div
        className="pywebview-drag-region flex h-full flex-1 cursor-move select-none"
        aria-hidden
        onPointerDown={beginWindowMove}
        onMouseDown={() => { if (!dragActiveRef.current) beginWindowMove() }}
        onDoubleClick={() => void action(async () => setMaximized(await windowToggleMaximize()), 'Не удалось изменить размер окна')}
      />

      <div className="flex items-center gap-2 rounded-full border border-border bg-white/[0.03] py-1 pl-2.5 pr-3 text-xs text-foreground">
        <span className="relative flex size-1.5">
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-60',
              cleaning ? 'bg-warning' : 'bg-primary',
            )}
          />
          <span className={cn('relative inline-flex size-1.5 rounded-full', cleaning ? 'bg-warning' : 'bg-primary')} />
        </span>
        <span className="relative inline-flex h-4 min-w-16 items-center overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={status}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {status}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div className="flex h-full items-stretch" data-no-drag>
        <WindowButton label="Свернуть" onClick={() => void action(windowMinimize, 'Не удалось свернуть окно')}>
          <Minus className="size-3.5" />
        </WindowButton>
        <WindowButton label={maximized ? 'Восстановить' : 'Развернуть'} onClick={() => void action(async () => setMaximized(await windowToggleMaximize()), 'Не удалось изменить размер окна')}>
          <Square className="size-3" />
        </WindowButton>
        <WindowButton label="Закрыть" danger onClick={() => void action(windowClose, 'Не удалось закрыть окно')}>
          <X className="size-3.5" />
        </WindowButton>
      </div>
    </div>
  )
}

function WindowButton({ label, danger, children, onClick }: { label: string; danger?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex w-11 items-center justify-center text-muted-foreground transition-colors duration-150',
        danger ? 'hover:bg-[#c42b1c] hover:text-white' : 'hover:bg-white/[0.06] hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
