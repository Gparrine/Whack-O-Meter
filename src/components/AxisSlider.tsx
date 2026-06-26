interface AxisSliderProps {
  value: number
  onChange: (value: number) => void
  showFullTimeline: boolean
  onToggleFullTimeline: (value: boolean) => void
  canShowFullTimeline: boolean
}

export function AxisSlider({
  value,
  onChange,
  showFullTimeline,
  onToggleFullTimeline,
  canShowFullTimeline,
}: AxisSliderProps) {
  return (
    <div className="axis-controls panel">
      <div className="axis-label">
        <span>Axis scale</span>
        <span>{value}%</span>
      </div>
      <input
        className="axis-slider"
        type="range"
        min={25}
        max={200}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Adjust axis scale"
      />
      <p className="status-text">100% = auto-trimmed bounds · lower zooms out · higher zooms in</p>
      {canShowFullTimeline ? (
        <label className="timeline-toggle">
          <input
            type="checkbox"
            checked={showFullTimeline}
            onChange={(event) => onToggleFullTimeline(event.target.checked)}
          />
          Show full timeline (reconstruct trimmed baseline regions)
        </label>
      ) : null}
    </div>
  )
}
