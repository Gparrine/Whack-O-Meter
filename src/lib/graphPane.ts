import type { AxisBounds, TrimResult } from './autoTrim'
import { autoTrim, scaleBounds } from './autoTrim'
import { expandFullTimeline, parseForceCsv, type ParsedSeries } from './csvParser'
import {
  computeImpactMetrics,
  DEFAULT_WEAPON_TYPE,
  type ImpactMetrics,
} from './metrics'
import { loadCsvText, type ManifestEntry } from './manifest'

export interface GraphPaneState {
  id: string
  search: string
  index: number
  axisScale: number
  showFullTimeline: boolean
  viewBounds: AxisBounds | null
}

export interface GraphPaneData {
  pane: GraphPaneState
  filtered: ManifestEntry[]
  current: ManifestEntry | null
  series: ParsedSeries | null
  trimResult: TrimResult | null
  metrics: ImpactMetrics | null
  baseBounds: AxisBounds | null
  bounds: AxisBounds | null
  loading: boolean
}

export function createPaneState(): GraphPaneState {
  return {
    id: crypto.randomUUID(),
    search: '',
    index: 0,
    axisScale: 100,
    showFullTimeline: false,
    viewBounds: null,
  }
}

export function filterEntries(entries: ManifestEntry[], query: string): ManifestEntry[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return entries
  return entries.filter(
    (entry) =>
      entry.filename.toLowerCase().includes(normalized) ||
      entry.title.toLowerCase().includes(normalized) ||
      entry.nickname?.toLowerCase().includes(normalized),
  )
}

export function manifestMetrics(entry: ManifestEntry | null): ImpactMetrics | null {
  if (!entry?.metrics) return null
  return {
    peakForceN: entry.metrics.peakForceN,
    peakForceLbf: entry.metrics.peakForceLbf,
    timeToPeakMs: entry.metrics.timeToPeakMs,
    forceDecayMs: entry.metrics.forceDecayMs,
    impulseNs: entry.metrics.impulseNs,
    weaponType: entry.metrics.weaponType ?? DEFAULT_WEAPON_TYPE,
  }
}

export function prepareSeries(parsed: ParsedSeries, showFullTimeline: boolean): ParsedSeries {
  if (showFullTimeline) {
    return expandFullTimeline(parsed)
  }
  if (parsed.metadata.eventStart !== undefined) {
    return parsed
  }
  const trimmed = autoTrim(parsed.time, parsed.force)
  return {
    ...parsed,
    time: trimmed.time,
    force: trimmed.force,
  }
}

export function computeBoundsForSeries(
  series: ParsedSeries,
  trimResult: TrimResult | null,
  axisScale: number,
): AxisBounds {
  if (trimResult) {
    return scaleBounds(trimResult.bounds, axisScale)
  }
  const bounds = {
    xMin: Math.min(...series.time),
    xMax: Math.max(...series.time),
    yMin: Math.min(...series.force),
    yMax: Math.max(...series.force),
  }
  const ySpan = Math.max(bounds.yMax - bounds.yMin, 1e-6)
  const padded = {
    ...bounds,
    yMin: bounds.yMin - ySpan * 0.1,
    yMax: bounds.yMax + ySpan * 0.1,
  }
  return scaleBounds(padded, axisScale)
}

export function effectiveBounds(
  baseBounds: AxisBounds | null,
  viewBounds: AxisBounds | null,
): AxisBounds | null {
  if (!baseBounds) return null
  return viewBounds ?? baseBounds
}

export async function loadPaneSeries(
  entry: ManifestEntry,
  showFullTimeline: boolean,
): Promise<{
  series: ParsedSeries
  trimResult: TrimResult | null
  metrics: ImpactMetrics
}> {
  const text = await loadCsvText(entry)
  const parsed = parseForceCsv(text)
  const prepared = prepareSeries(parsed, showFullTimeline)
  const trimmed =
    prepared.metadata.eventStart === undefined && !showFullTimeline
      ? autoTrim(prepared.time, prepared.force)
      : null

  const series = trimmed
    ? { ...prepared, time: trimmed.time, force: trimmed.force }
    : prepared

  const fromManifest = manifestMetrics(entry)
  const metrics = fromManifest ?? computeImpactMetrics(parsed)

  return { series, trimResult: trimmed, metrics }
}

export function updatePane<K extends keyof GraphPaneState>(
  panes: GraphPaneState[],
  id: string,
  patch: Pick<GraphPaneState, K>,
): GraphPaneState[] {
  return panes.map((pane) => (pane.id === id ? { ...pane, ...patch } : pane))
}

export function swapPanes(panes: GraphPaneState[], sourceId: string, targetId: string): GraphPaneState[] {
  const sourceIndex = panes.findIndex((pane) => pane.id === sourceId)
  const targetIndex = panes.findIndex((pane) => pane.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return panes
  }
  const next = [...panes]
  ;[next[sourceIndex], next[targetIndex]] = [next[targetIndex]!, next[sourceIndex]!]
  return next
}

export interface AnalysisPaneSnapshot {
  filename: string | null
  nickname?: string
  metrics: ImpactMetrics | null
  series: ParsedSeries | null
}

export function buildAnalysisSnapshots(
  paneData: Map<string, GraphPaneData>,
  panes: GraphPaneState[],
): AnalysisPaneSnapshot[] {
  return panes.map((pane) => {
    const data = paneData.get(pane.id)
    return {
      filename: data?.current?.filename ?? null,
      nickname: data?.current?.nickname ?? data?.series?.metadata.nickname,
      metrics: data?.metrics ?? null,
      series: data?.series ?? null,
    }
  })
}
