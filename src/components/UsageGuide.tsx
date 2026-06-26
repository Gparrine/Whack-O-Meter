import { useState } from 'react'

export function UsageGuide() {
  const [expanded, setExpanded] = useState(false)

  return (
    <button
      type="button"
      className={`usage-guide${expanded ? ' usage-guide--expanded' : ''}`}
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}
    >
      <span className="usage-guide-heading">How to use Whack-O-Meter</span>
      {expanded ? (
        <ul className="usage-guide-list">
          <li>Search and load a CSV from the catalog in each readout pane.</li>
          <li>Review peak force, impulse, and timing in the metrics panel; drag on the graph to zoom.</li>
          <li>Use the navigator strip to scroll and focus a time window.</li>
          <li>Click <strong>+ Add Readout</strong> to compare two curves side by side (drag the grip to swap panes).</li>
          <li>Add analysis parameters, then run <strong>Run AI Analysis</strong> for AI commentary and saved research memory.</li>
        </ul>
      ) : (
        <p className="usage-guide-teaser">
          Search a CSV, read metrics, drag to zoom, compare with + Add Readout, then run AI analysis. Click for
          details.
        </p>
      )}
    </button>
  )
}
