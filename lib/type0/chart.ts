type Point = [number, number]

export function toPoints(values: number[], width: number, height: number, slots = values.length, max = 100): Point[] {
  const step = slots > 1 ? width / (slots - 1) : width
  const offset = (slots - values.length) * step
  return values.map((v, i) => [offset + i * step, height - (Math.min(Math.max(v, 0), max) / max) * height])
}

/** Catmull-Rom spline converted to cubic Bézier segments for a smooth line. */
export function smoothPath(points: Point[]) {
  if (points.length < 2) return ''
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return d
}

export function areaPath(points: Point[], height: number) {
  if (points.length < 2) return ''
  const line = smoothPath(points)
  return `${line} L${points[points.length - 1][0]},${height} L${points[0][0]},${height} Z`
}
