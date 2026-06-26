import { useEffect, useMemo, useState } from 'react'
import { Header } from './components/Header'
import { SearchBar } from './components/SearchBar'
import { NavButton } from './components/GraphNavigator'
import { ForceGraph } from './components/ForceGraph'
import { MetricsReadout } from './components/MetricsReadout'
import { AxisSlider } from './components/AxisSlider'
import { DataAnalysis } from './components/DataAnalysis'
import { ErrorConsole } from './components/ErrorConsole'
import { autoTrim, scaleBounds, type TrimResult } from './lib/autoTrim'
import { expandFullTimeline, parseForceCsv, type ParsedSeries } from './lib/csvParser'
import { useErrors } from './lib/errors'
import {
  computeImpactMetrics,
  DEFAULT_WEAPON_TYPE,
  type ImpactMetrics,
} from './lib/metrics'
import { loadCsvText, loadManifest, type ManifestEntry } from './lib/manifest'
import './styles/cathode.css'

function filterEntries(entries: ManifestEntry[], query: string): ManifestEntry[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return entries
  return entries.filter(
    (entry) =>
      entry.filename.toLowerCase().includes(normalized) ||
      entry.title.toLowerCase().includes(normalized) ||
      entry.nickname?.toLowerCase().includes(normalized),
  )
}

function manifestMetrics(entry: ManifestEntry | null): ImpactMetrics | null {
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

function prepareSeries(parsed: ParsedSeries, showFullTimeline: boolean): ParsedSeries {
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

function computeBoundsForSeries(series: ParsedSeries, trimResult: TrimResult | null, axisScale: number) {
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

export default function App() {
  const { reportError, clearSource } = useErrors()
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [search, setSearch] = useState('')
  const [index, setIndex] = useState(0)
  const [axisScale, setAxisScale] = useState(100)
  const [showFullTimeline, setShowFullTimeline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [series, setSeries] = useState<ParsedSeries | null>(null)
  const [trimResult, setTrimResult] = useState<TrimResult | null>(null)
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null)

  const filtered = useMemo(() => filterEntries(entries, search), [entries, search])
  const current = filtered[index] ?? null

  useEffect(() => {
    void loadManifest()
      .then((manifest) => setEntries(manifest.files))
      .catch((err: unknown) => {
        reportError('Manifest', err instanceof Error ? err.message : 'Failed to load manifest')
      })
      .finally(() => setLoading(false))
  }, [reportError])

  useEffect(() => {
    setIndex(0)
  }, [search])

  useEffect(() => {
    if (!current) {
      setSeries(null)
      setTrimResult(null)
      setMetrics(null)
      return
    }

    setLoading(true)
    clearSource('CSV')
    clearSource('Metrics')

    void loadCsvText(current)
      .then((text) => {
        const parsed = parseForceCsv(text)
        const prepared = prepareSeries(parsed, showFullTimeline)
        const trimmed =
          prepared.metadata.eventStart === undefined && !showFullTimeline
            ? autoTrim(prepared.time, prepared.force)
            : null

        setSeries(
          trimmed
            ? { ...prepared, time: trimmed.time, force: trimmed.force }
            : prepared,
        )
        setTrimResult(trimmed)
        setAxisScale(100)

        const fromManifest = manifestMetrics(current)
        if (fromManifest) {
          setMetrics(fromManifest)
        } else {
          try {
            setMetrics(computeImpactMetrics(parsed))
          } catch (error) {
            reportError(
              'Metrics',
              error instanceof Error ? error.message : 'Failed to compute metrics',
            )
            setMetrics(null)
          }
        }
      })
      .catch((err: unknown) => {
        reportError(
          'CSV',
          err instanceof Error ? `${current.filename}: ${err.message}` : `Failed to load ${current.filename}`,
        )
        setSeries(null)
        setTrimResult(null)
        setMetrics(null)
      })
      .finally(() => setLoading(false))
  }, [current, showFullTimeline, reportError, clearSource])

  const bounds = useMemo(() => {
    if (!series) return null
    return computeBoundsForSeries(series, trimResult, axisScale)
  }, [series, trimResult, axisScale])

  const goPrevious = () => {
    if (filtered.length === 0) return
    setIndex((value) => (value - 1 + filtered.length) % filtered.length)
  }

  const goNext = () => {
    if (filtered.length === 0) return
    setIndex((value) => (value + 1) % filtered.length)
  }

  return (
    <main className="app-shell">
      <Header />
      <SearchBar
        value={search}
        onChange={setSearch}
        resultCount={filtered.length}
      />

      {loading && !series ? <p className="status-text">Loading telemetry...</p> : null}

      {!loading && filtered.length === 0 ? (
        <p className="analysis-empty panel">No CSV files match your search.</p>
      ) : null}

      {series && bounds && current ? (
        <>
          <div className="graph-row">
            <NavButton
              direction="previous"
              onClick={goPrevious}
              disabled={filtered.length <= 1}
            />
            <ForceGraph
              time={series.time}
              force={series.force}
              bounds={bounds}
              timeLabel={series.timeLabel}
              forceLabel={series.forceLabel}
              filename={current.filename}
              nickname={current.nickname ?? series.metadata.nickname}
              warning={trimResult?.warning}
            />
            <MetricsReadout metrics={metrics} loading={loading} />
            <NavButton
              direction="next"
              onClick={goNext}
              disabled={filtered.length <= 1}
            />
          </div>
          <AxisSlider
            value={axisScale}
            onChange={setAxisScale}
            showFullTimeline={showFullTimeline}
            onToggleFullTimeline={setShowFullTimeline}
            canShowFullTimeline={
              series.metadata.prefixTrimEnd !== undefined &&
              series.metadata.suffixTrimStart !== undefined
            }
          />
          <DataAnalysis filename={current.filename} />
        </>
      ) : null}

      <ErrorConsole />
    </main>
  )
}
