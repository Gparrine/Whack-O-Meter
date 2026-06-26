import { NavButton } from './GraphNavigator'
import { ForceGraph } from './ForceGraph'
import { MetricsReadout } from './MetricsReadout'
import type { GraphPaneData } from '../lib/graphPane'

interface TelemetryBundleProps {
  data: GraphPaneData
  draggable: boolean
  dragSourceId: string | null
  onDragStart: (paneId: string) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (paneId: string) => void
  onDragEnd: () => void
  onPrevious: () => void
  onNext: () => void
  onViewBoundsChange: (bounds: import('../lib/autoTrim').AxisBounds | null) => void
}

export function TelemetryBundle({
  data,
  draggable,
  dragSourceId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPrevious,
  onNext,
  onViewBoundsChange,
}: TelemetryBundleProps) {
  const { current, series, bounds, metrics, loading, trimResult, pane } = data
  const isDragging = dragSourceId === pane.id

  if (!series || !bounds || !current) {
    return (
      <div className="telemetry-pane">
        <div className="telemetry-bundle panel">
          <p className="status-text">Select a CSV to display telemetry.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`telemetry-pane${isDragging ? ' telemetry-pane-dragging' : ''}`}
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault()
        onDrop(pane.id)
      }}
    >
      <div className="telemetry-bundle panel">
        {draggable ? (
          <div
            className="bundle-grip"
            draggable
            aria-label="Drag to reorder comparison panes"
            title="Drag to swap pane position"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', pane.id)
              onDragStart(pane.id)
            }}
            onDragEnd={onDragEnd}
          >
            <span className="bundle-grip-ridges" />
          </div>
        ) : null}
        <div className="telemetry-bundle-inner">
          <NavButton
            direction="previous"
            onClick={onPrevious}
            disabled={data.filtered.length <= 1}
          />
          <ForceGraph
            time={series.time}
            force={series.force}
            bounds={bounds}
            forceLabel={series.forceLabel}
            filename={current.filename}
            nickname={current.nickname ?? series.metadata.nickname}
            warning={trimResult?.warning}
            viewBounds={pane.viewBounds}
            onViewBoundsChange={onViewBoundsChange}
          />
          <MetricsReadout metrics={metrics} loading={loading} />
          <NavButton
            direction="next"
            onClick={onNext}
            disabled={data.filtered.length <= 1}
          />
        </div>
      </div>
    </div>
  )
}
