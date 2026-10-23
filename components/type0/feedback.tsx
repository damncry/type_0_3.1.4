'use client'

import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Btn, spring } from './primitives'

type Tone = 'success' | 'info' | 'warning'
type Toast = { id: number; title: string; description?: string; tone: Tone }
type ConfirmOptions = { title: string; message: string; confirmText?: string; danger?: boolean }

type FeedbackCtx = {
  toast: (t: Omit<Toast, 'id' | 'tone'> & { tone?: Tone }) => void
  confirm: (o: ConfirmOptions) => Promise<boolean>
}

const Ctx = createContext<FeedbackCtx | null>(null)

export function useFeedback() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFeedback must be used inside FeedbackProvider')
  return c
}

const toneIcon = {
  success: <CheckCircle2 className="size-4 text-primary" aria-hidden />,
  info: <Info className="size-4 text-cpu" aria-hidden />,
  warning: <AlertTriangle className="size-4 text-warning" aria-hidden />,
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback<FeedbackCtx['toast']>(
    ({ tone = 'success', ...t }) => {
      const id = ++nextId.current
      setToasts((list) => [...list.slice(-2), { id, tone, ...t }])
      setTimeout(() => dismiss(id), 3600)
    },
    [dismiss],
  )

  const confirm = useCallback<FeedbackCtx['confirm']>(
    (o) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })),
    [],
  )

  useEffect(() => {
    const onBackendError = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      toast({
        title: 'Ошибка связи с системной частью',
        description: typeof detail === 'string' ? detail : 'Не удалось получить ответ от type_0.',
        tone: 'warning',
      })
    }
    window.addEventListener('type0:backend-error', onBackendError)
    return () => window.removeEventListener('type0:backend-error', onBackendError)
  }, [toast])

  const close = (v: boolean) => {
    dialog?.resolve(v)
    setDialog(null)
  }

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
              transition={spring}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-elevated/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-md"
            >
              <span className="mt-0.5">{toneIcon[t.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Закрыть уведомление"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>{dialog && <ConfirmDialog key="confirm" {...dialog} onClose={close} />}</AnimatePresence>
    </Ctx.Provider>
  )
}

function ConfirmDialog({
  title,
  message,
  confirmText = 'Подтвердить',
  danger,
  onClose,
}: ConfirmOptions & { onClose: (v: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => onClose(false)} aria-hidden />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.14 } }}
        transition={spring}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-elevated p-5 shadow-2xl shadow-black/50"
      >
        <div
          className={cn(
            'mb-4 flex size-9 items-center justify-center rounded-xl',
            danger ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary',
          )}
        >
          {danger ? <AlertTriangle className="size-4" aria-hidden /> : <Info className="size-4" aria-hidden />}
        </div>
        <h2 id="confirm-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p id="confirm-desc" className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => onClose(false)}>
            Отмена
          </Btn>
          <Btn ref={confirmRef} variant={danger ? 'danger' : 'primary'} onClick={() => onClose(true)}>
            {confirmText}
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  )
}
