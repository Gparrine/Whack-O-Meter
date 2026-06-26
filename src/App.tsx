import { useEffect, useMemo, useState } from 'react'
import { Header } from './components/Header'
import { SearchBar } from './components/SearchBar'
import { NavButton } from './components/GraphNavigator'
import { ForceGraph } from './components/ForceGraph'
import { AxisSlider } from './components/AxisSlider'
import { DataAnalysis } from './components/DataAnalysis'
import { autoTrim, scaleBounds, type TrimResult } from './lib/autoTrim'
import { parseForceCsv } from './lib/csvParser'
import { loadCsvText, loadManifest, type ManifestEntry } from './lib/manifest'
import './styles/cathode.css'

function filterEntries(entries: ManifestEntry[], query: string): ManifestEntry[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return entries
  return entries.filter(
    (entry) =>
      entry.filename.toLowerCase().includes(normalized) ||
      entry.title.toLowerCase().includes(normalized),
  )
}

export default function App() {
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [search, setSearch] = useState('')
  const [index, setIndex] = useState(0)
  const [axisScale, setAxisScale] = useState(100)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [series, setSeries] = useState<ReturnType<typeof parseForceCsv> | null>(null)
  const [trimResult, setTrimResult] = useState<TrimResult | null>(null)

  const filtered = useMemo(() => filterEntries(entries, search), [entries, search])
  const current = filtered[index] ?? null

  useEffect(() => {
    void loadManifest()
      .then((manifest) => setEntries(manifest.files))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load manifest')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setIndex(0)
  }, [search])

  useEffect(() => {
    if (!current) {
      setSeries(null)
      return
    }

    setLoading(true)
    setError(null)
    void loadCsvText(current.path)
      .then((text) => {
        const parsed = parseForceCsv(text)
        const trimmed = autoTrim(parsed.time, parsed.force)
        setTrimResult(trimmed)
        setSeries({
          ...parsed,
          time: trimmed.time,
          force: trimmed.force,
        })
        setAxisScale(100)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load CSV')
        setSeries(null)
      })
      .finally(() => setLoading(false))
  }, [current])

  const bounds = useMemo(() => {
    if (!trimResult) return null
    return scaleBounds(trimResult.bounds, axisScale)
  }, [trimResult, axisScale])

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
      {error ? <p className="error-text">{error}</p> : null}

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
              warning={trimResult?.warning}
            />
            <NavButton
              direction="next"
              onClick={goNext}
              disabled={filtered.length <= 1}
            />
          </div>
          <AxisSlider value={axisScale} onChange={setAxisScale} />
          <DataAnalysis filename={current.filename} />
        </>
      ) : null}
    </main>
  )
}
