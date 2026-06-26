import { useCallback, useState } from 'react'
import { GraphPane } from './GraphPane'
import { swapPanes, type GraphPaneData, type GraphPaneState } from '../lib/graphPane'
import type { ManifestEntry } from '../lib/manifest'

interface GraphWorkspaceProps {
  panes: GraphPaneState[]
  entries: ManifestEntry[]
  onPanesChange: React.Dispatch<React.SetStateAction<GraphPaneState[]>>
  onAddPane: () => void
  onPaneDataChange: (id: string, data: GraphPaneData) => void
}

export function GraphWorkspace({
  panes,
  entries,
  onPanesChange,
  onAddPane,
  onPaneDataChange,
}: GraphWorkspaceProps) {
  const [dragSourceId, setDragSourceId] = useState<string | null>(null)

  const handlePaneChange = useCallback(
    (id: string, patch: Partial<GraphPaneState>) => {
      onPanesChange((current) =>
        current.map((pane) => (pane.id === id ? { ...pane, ...patch } : pane)),
      )
    },
    [onPanesChange],
  )

  const handleDrop = useCallback(
    (targetId: string) => {
      if (!dragSourceId) return
      onPanesChange((current) => swapPanes(current, dragSourceId, targetId))
      setDragSourceId(null)
    },
    [dragSourceId, onPanesChange],
  )

  const canAddPane = panes.length < 2

  return (
    <section className="graph-workspace">
      <div className="workspace-toolbar">
        {canAddPane ? (
          <button type="button" className="action-button add-readout-button" onClick={onAddPane}>
            + Add Readout
          </button>
        ) : null}
      </div>
      <div className="graph-workspace-panes">
        {panes.map((pane) => (
          <GraphPane
            key={pane.id}
            pane={pane}
            entries={entries}
            draggable={panes.length > 1}
            dragSourceId={dragSourceId}
            onPaneChange={handlePaneChange}
            onDragStart={setDragSourceId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            onDragEnd={() => setDragSourceId(null)}
            onDataChange={onPaneDataChange}
          />
        ))}
      </div>
    </section>
  )
}
