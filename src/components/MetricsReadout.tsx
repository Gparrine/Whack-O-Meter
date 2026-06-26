import type { ImpactMetrics } from '../lib/metrics'
import {
  formatForceLbf,
  formatForceN,
  formatImpulse,
  formatMs,
} from '../lib/metrics'

interface MetricsReadoutProps {
  metrics: ImpactMetrics | null
  loading?: boolean
}

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="readout-row">
      <span className="readout-label">{label}</span>
      <span className="readout-value">{value}</span>
    </div>
  )
}

export function MetricsReadout({ metrics, loading }: MetricsReadoutProps) {
  return (
    <aside className="metrics-readout panel" aria-label="Impact metrics readout">
      <h2 className="metrics-title">Impact Readout</h2>
      <div className="metrics-screen">
        {loading ? <p className="status-text">Computing...</p> : null}
        {!loading && metrics ? (
          <>
            <ReadoutRow label="Peak Force" value={formatForceN(metrics.peakForceN)} />
            <ReadoutRow label="Peak (lbf)" value={formatForceLbf(metrics.peakForceLbf)} />
            <ReadoutRow label="Time to Peak" value={formatMs(metrics.timeToPeakMs)} />
            <ReadoutRow label="Force Decay" value={formatMs(metrics.forceDecayMs)} />
            <ReadoutRow label="Impulse" value={formatImpulse(metrics.impulseNs)} />
            <ReadoutRow label="Weapon Type" value={metrics.weaponType} />
          </>
        ) : null}
        {!loading && !metrics ? (
          <p className="analysis-empty">No metrics available.</p>
        ) : null}
      </div>
    </aside>
  )
}
