interface AxisSliderProps {
  value: number
  onChange: (value: number) => void
}

export function AxisSlider({ value, onChange }: AxisSliderProps) {
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
    </div>
  )
}
