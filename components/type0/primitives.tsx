'use client'

import { motion, useSpring, useTransform } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { useEffect, useId } from 'react'
import { cn } from '@/lib/utils'

export const spring = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 } as const
export const softSpring = { type: 'spring', stiffness: 140, damping: 22, mass: 0.7 } as const

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card/90 backdrop-blur-sm', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:brightness-110',
  secondary: 'bg-secondary text-foreground hover:bg-white/[0.08] border border-border',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]',
  danger: 'bg-destructive/12 text-destructive hover:bg-destructive/20 border border-destructive/20',
}

export function Btn({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: React.ComponentProps<'button'> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,filter,transform,opacity,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 [&_svg]:size-4 [&_svg]:shrink-0',
        size === 'md' ? 'h-9 px-3.5 text-sm' : 'h-7 px-2.5 text-xs',
        btnVariants[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
        checked ? 'justify-end bg-primary' : 'justify-start bg-white/[0.1]',
      )}
    >
      <motion.span
        layout
        transition={spring}
        className={cn('size-4 rounded-full shadow-sm', checked ? 'bg-primary-foreground' : 'bg-foreground/80')}
      />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
  size?: 'sm' | 'md'
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-black/20 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-md font-medium transition-colors duration-150',
              size === 'md' ? 'h-7 px-3 text-xs' : 'h-6 px-2.5 text-[11px]',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 rounded-md bg-white/[0.09]" />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  onCommit?: () => void
}) {
  const id = useId()
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-foreground">
          {label}
        </label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        className="t0-range"
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
      />
    </div>
  )
}

export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const s = useSpring(value, { stiffness: 90, damping: 20, mass: 0.6 })
  const text = useTransform(s, (v) => v.toFixed(decimals))
  useEffect(() => {
    s.set(value)
  }, [s, value])
  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>
}

export function Ring({
  value,
  color,
  size = 112,
  stroke = 8,
  children,
}: {
  value: number
  color: string
  size?: number
  stroke?: number
  children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(value, 100) / 100) }}
          transition={softSpring}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150',
        checked ? 'border-primary bg-primary' : 'border-white/20 hover:border-white/40',
      )}
    >
      <motion.svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
        <motion.path
          d="M2.5 6.2 5 8.5 9.5 3.5"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.18 }}
        />
      </motion.svg>
    </button>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
