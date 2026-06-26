import { useEffect, useMemo, useState } from 'react'
import { SearchBar } from './SearchBar'
import { AxisSlider } from './AxisSlider'
import { TelemetryBundle } from './TelemetryBundle'
import {
  computeBoundsForSeries,
  effectiveBounds,
  filterEntries,
  loadPaneSeries,
  type GraphPaneData,
  type GraphPaneState,
} from '../lib/graphPane'
import type { ManifestEntry } from '../lib/manifest'
import type { AxisBounds } from '../lib/autoTrim'
import { useErrors } from '../lib/errors'

interface GraphPaneProps {
  pane: GraphPaneState
  entries: ManifestEntry[]
  draggable: boolean
  showRemove: boolean
  dragSourceId: string | null
  onPaneChange: (id: string, patch: Partial<GraphPaneState>) => void
  onRemove: () => void
  onDragStart: (paneId: string) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (paneId: string) => void
  onDragEnd: () => void
  onDataChange: (id: string, data: GraphPaneData) => void
}

export function GraphPane({
  pane,
  entries,
  draggable,
  showRemove,
  dragSourceId,
  onPaneChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDataChange,
}: GraphPaneProps) {
  const { reportError, clearSource } = useErrors()
  const [series, setSeries] = useState<GraphPaneData['series']>(null)
  const [trimResult, setTrimResult] = useState<GraphPaneData['trimResult']>(null)
  const [metrics, setMetrics] = useState<GraphPaneData['metrics']>(null)
  const [loading, setLoading] = useState(false)

  const filtered = useMemo(() => filterEntries(entries, pane.search), [entries, pane.search])
  const current = filtered[pane.index] ?? null

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
    onPaneChange(pane.id, { viewBounds: null, axisScale: 100 })

    void loadPaneSeries(current, pane.showFullTimeline)
      .then((result) => {
        setSeries(result.series)
        setTrimResult(result.trimResult)
        setMetrics(result.metrics)
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
  }, [current, pane.showFullTimeline, pane.id, reportError, clearSource, onPaneChange])

  const baseBounds = useMemo(() => {
    if (!series) return null
    return computeBoundsForSeries(series, trimResult, pane.axisScale)
  }, [series, trimResult, pane.axisScale])

  const bounds = useMemo(
    () => effectiveBounds(baseBounds, pane.viewBounds),
    [baseBounds, pane.viewBounds],
  )

  const paneData: GraphPaneData = useMemo(
    () => ({
      pane,
      filtered,
      current,
      series,
      trimResult,
      metrics,
      baseBounds,
      bounds,
      loading,
    }),
    [pane, filtered, current, series, trimResult, metrics, baseBounds, bounds, loading],
  )

  useEffect(() => {
    onDataChange(pane.id, paneData)
  }, [pane.id, paneData, onDataChange])

  const goPrevious = () => {
    if (filtered.length === 0) return
    onPaneChange(pane.id, {
      index: (pane.index - 1 + filtered.length) % filtered.length,
      viewBounds: null,
    })
  }

  const goNext = () => {
    if (filtered.length === 0) return
    onPaneChange(pane.id, {
      index: (pane.index + 1) % filtered.length,
      viewBounds: null,
    })
  }

  const handleViewBoundsChange = (viewBounds: AxisBounds | null) => {
    onPaneChange(pane.id, { viewBounds })
  }

  return (
    <div className="graph-pane">
      <div className="graph-pane-toolbar">
        <SearchBar
          value={pane.search}
          onChange={(search) => onPaneChange(pane.id, { search, index: 0, viewBounds: null })}
          resultCount={filtered.length}
        />
        {showRemove ? (
          <button type="button" className="action-button remove-readout-button" onClick={onRemove}>
            - Remove
          </button>
        ) : null}
      </div>
      <TelemetryBundle
        data={paneData}
        draggable={draggable}
        dragSourceId={dragSourceId}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onPrevious={goPrevious}
        onNext={goNext}
        onViewBoundsChange={handleViewBoundsChange}
      />
      {series && bounds && current ? (
        <AxisSlider
          value={pane.axisScale}
          onChange={(axisScale) => onPaneChange(pane.id, { axisScale, viewBounds: null })}
          showFullTimeline={pane.showFullTimeline}
          onToggleFullTimeline={(showFullTimeline) =>
            onPaneChange(pane.id, { showFullTimeline, viewBounds: null })
          }
          canShowFullTimeline={
            series.metadata.prefixTrimEnd !== undefined &&
            series.metadata.suffixTrimStart !== undefined
          }
        />
      ) : null}
    </div>
  )
}
