import type { ParsedSeries } from './csvParser'

export interface ImpactMetrics {
  peakForceN: number
  peakForceLbf: number
  timeToPeakMs: number
  forceDecayMs: number
  impulseNs: number
  weaponType: string
}

const LBF_PER_N = 1 / 4.44822
export const DEFAULT_WEAPON_TYPE = 'Rengenyei Standard'

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

export function detectImpactWindow(
  _absoluteTime: number[],
  force: number[],
  k = 3,
): {
  startIndex: number
  endIndex: number
  peakIndex: number
  baseline: number
} {
  const edgeCount = Math.max(1, Math.floor(force.length * 0.05))
  const baselineSamples = [
    ...force.slice(0, edgeCount),
    ...force.slice(-edgeCount),
  ]
  const baseline = median(baselineSamples)
  const spread = stdDev(baselineSamples, baseline)
  const peakDelta = Math.max(...force.map((value) => Math.abs(value - baseline)))
  const threshold = Math.max(spread * k, peakDelta * 0.05, 1e-6)

  let startIndex = 0
  let endIndex = force.length - 1

  for (let i = 0; i < force.length; i += 1) {
    if (Math.abs(force[i]! - baseline) > threshold) {
      startIndex = i
      break
    }
  }

  for (let i = force.length - 1; i >= 0; i -= 1) {
    if (Math.abs(force[i]! - baseline) > threshold) {
      endIndex = i
      break
    }
  }

  if (startIndex >= endIndex) {
    const peakIndex = force.indexOf(Math.max(...force))
    const pad = Math.max(2, Math.floor(force.length * 0.02))
    return {
      startIndex: Math.max(0, peakIndex - pad),
      endIndex: Math.min(force.length - 1, peakIndex + pad),
      peakIndex,
      baseline,
    }
  }

  const pad = Math.max(1, Math.floor((endIndex - startIndex + 1) * 0.02))
  startIndex = Math.max(0, startIndex - pad)
  endIndex = Math.min(force.length - 1, endIndex + pad)

  let peakIndex = startIndex
  let peakValue = force[startIndex]!
  for (let i = startIndex; i <= endIndex; i += 1) {
    if (force[i]! > peakValue) {
      peakValue = force[i]!
      peakIndex = i
    }
  }

  return { startIndex, endIndex, peakIndex, baseline }
}

export function computeImpactMetrics(series: ParsedSeries): ImpactMetrics {
  const time = series.absoluteTime.length > 0 ? series.absoluteTime : series.time
  const { startIndex, endIndex, peakIndex } = detectImpactWindow(time, series.force)

  const eventTime = time.slice(startIndex, endIndex + 1)
  const eventForce = series.force.slice(startIndex, endIndex + 1)
  const peakForceN = eventForce[peakIndex - startIndex] ?? Math.max(...eventForce)
  const peakTime = time[peakIndex] ?? eventTime[0] ?? 0
  const eventStart = time[startIndex] ?? 0
  const eventEnd = time[endIndex] ?? peakTime

  let impulseNs = 0
  for (let i = 1; i < eventTime.length; i += 1) {
    const dt = eventTime[i]! - eventTime[i - 1]!
    impulseNs += ((eventForce[i]! + eventForce[i - 1]!) / 2) * dt
  }

  return {
    peakForceN,
    peakForceLbf: peakForceN * LBF_PER_N,
    timeToPeakMs: Math.max(0, peakTime - eventStart) * 1000,
    forceDecayMs: Math.max(0, eventEnd - peakTime) * 1000,
    impulseNs,
    weaponType: DEFAULT_WEAPON_TYPE,
  }
}

export function formatForceN(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} N`
}

export function formatForceLbf(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} lbf`
}

export function formatMs(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`
}

export function formatImpulse(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} N·s`
}
