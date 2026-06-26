import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from './components/Header'
import { UsageGuide } from './components/UsageGuide'
import { GraphWorkspace } from './components/GraphWorkspace'
import { DataAnalysis } from './components/DataAnalysis'
import { ErrorConsole } from './components/ErrorConsole'
import { AppFooter } from './components/AppFooter'
import {
  buildAnalysisSnapshots,
  createPaneState,
  type GraphPaneData,
  type GraphPaneState,
} from './lib/graphPane'
import { loadManifest, type ManifestEntry } from './lib/manifest'
import { useErrors } from './lib/errors'
import './styles/cathode.css'

export default function App() {
  const { reportError } = useErrors()
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [panes, setPanes] = useState<GraphPaneState[]>(() => [createPaneState()])
  const [paneDataMap, setPaneDataMap] = useState<Map<string, GraphPaneData>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadManifest()
      .then((manifest) => setEntries(manifest.files))
      .catch((err: unknown) => {
        reportError('Manifest', err instanceof Error ? err.message : 'Failed to load manifest')
      })
      .finally(() => setLoading(false))
  }, [reportError])

  const handlePaneDataChange = useCallback((id: string, data: GraphPaneData) => {
    setPaneDataMap((current) => {
      const next = new Map(current)
      next.set(id, data)
      return next
    })
  }, [])

  const analysisSnapshots = useMemo(
    () => buildAnalysisSnapshots(paneDataMap, panes),
    [paneDataMap, panes],
  )

  const hasAnySeries = analysisSnapshots.some((snapshot) => snapshot.series !== null)

  return (
    <main className="app-shell">
      <Header />

      {entries.length > 0 ? <UsageGuide /> : null}

      {loading && entries.length === 0 ? (
        <p className="status-text">Loading telemetry catalog...</p>
      ) : null}

      {!loading && entries.length === 0 ? (
        <p className="analysis-empty panel">No CSV files found in manifest.</p>
      ) : null}

      {entries.length > 0 ? (
        <>
          <GraphWorkspace
            panes={panes}
            entries={entries}
            onPanesChange={setPanes}
            onAddPane={() => setPanes((current) => [...current, createPaneState()])}
            onPaneDataChange={handlePaneDataChange}
          />
          {hasAnySeries ? <DataAnalysis panes={analysisSnapshots} /> : null}
        </>
      ) : null}

      <ErrorConsole />
      <AppFooter />
    </main>
  )
}
