'use client'

import { useId } from 'react'
import { areaPath, smoothPath, toPoints } from '@/lib/type0/chart'

export function Sparkline({ values, color, slots = 48, className }: { values: number[]; color: string; slots?: number; className?: string }) {
  const id = `spark${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const w = 200
  const h = 44
  const data = values.slice(-slots)
  const pts = toPoints(data, w, h, slots)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, h)} fill={`url(#${id})`} />
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
