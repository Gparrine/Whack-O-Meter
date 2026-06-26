export interface AxisBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface TrimResult {
  time: number[]
  force: number[]
  bounds: AxisBounds
  trimmed: boolean
  warning?: string
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function stdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function autoTrim(
  time: number[],
  force: number[],
  k = 3,
): TrimResult {
  if (time.length !== force.length || time.length === 0) {
    throw new Error('Time and force arrays must be the same non-zero length')
  }

  if (time.length < 20) {
    return {
      time,
      force,
      bounds: computeBounds(time, force),
      trimmed: false,
      warning: 'Short sample — showing full range.',
    }
  }

  const edgeCount = Math.max(1, Math.floor(time.length * 0.05))
  const baselineSamples = [
    ...force.slice(0, edgeCount),
    ...force.slice(-edgeCount),
  ]
  const baseline = median(baselineSamples)
  const spread = stdDev(baselineSamples, baseline)
  const peak = Math.max(...force.map((v) => Math.abs(v - baseline)))
  const threshold = Math.max(spread * k, peak * 0.05, 1e-6)

  let start = 0
  let end = force.length - 1

  for (let i = 0; i < force.length; i += 1) {
    if (Math.abs(force[i]! - baseline) > threshold) {
      start = i
      break
    }
  }

  for (let i = force.length - 1; i >= 0; i -= 1) {
    if (Math.abs(force[i]! - baseline) > threshold) {
      end = i
      break
    }
  }

  if (start >= end) {
    const peakIndex = force.indexOf(Math.max(...force))
    const pad = Math.max(2, Math.floor(time.length * 0.02))
    start = Math.max(0, peakIndex - pad)
    end = Math.min(time.length - 1, peakIndex + pad)
    return {
      time: time.slice(start, end + 1),
      force: force.slice(start, end + 1),
      bounds: computeBounds(time.slice(start, end + 1), force.slice(start, end + 1)),
      trimmed: true,
      warning: 'Low signal — trimmed around peak.',
    }
  }

  const pad = Math.max(1, Math.floor((end - start + 1) * 0.02))
  start = Math.max(0, start - pad)
  end = Math.min(time.length - 1, end + pad)

  const trimmedTime = time.slice(start, end + 1)
  const trimmedForce = force.slice(start, end + 1)

  return {
    time: trimmedTime,
    force: trimmedForce,
    bounds: computeBounds(trimmedTime, trimmedForce),
    trimmed: true,
  }
}

function computeBounds(time: number[], force: number[]): AxisBounds {
  const xMin = Math.min(...time)
  const xMax = Math.max(...time)
  const yMinRaw = Math.min(...force)
  const yMaxRaw = Math.max(...force)
  const ySpan = Math.max(yMaxRaw - yMinRaw, 1e-6)

  return {
    xMin,
    xMax,
    yMin: yMinRaw - ySpan * 0.1,
    yMax: yMaxRaw + ySpan * 0.1,
  }
}

export function scaleBounds(bounds: AxisBounds, scalePercent: number): AxisBounds {
  const scale = scalePercent / 100
  const xCenter = (bounds.xMin + bounds.xMax) / 2
  const yCenter = (bounds.yMin + bounds.yMax) / 2
  const xHalf = ((bounds.xMax - bounds.xMin) / 2) / scale
  const yHalf = ((bounds.yMax - bounds.yMin) / 2) / scale

  return {
    xMin: xCenter - xHalf,
    xMax: xCenter + xHalf,
    yMin: yCenter - yHalf,
    yMax: yCenter + yHalf,
  }
}
