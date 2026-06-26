import type { AnalysisPaneSnapshot } from './graphPane'
import { compositeMemoryKey } from './memoryParser'
import type { MemorySection } from './memoryParser'

function samplePoints(series: NonNullable<AnalysisPaneSnapshot['series']>): Array<{ t: number; f: number }> {
  const { time, force } = series
  const step = Math.max(1, Math.floor(time.length / 8))
  const points: Array<{ t: number; f: number }> = []
  for (let i = 0; i < time.length; i += step) {
    points.push({ t: time[i]!, f: force[i]! })
    if (points.length >= 10) break
  }
  return points
}

function formatPaneBlock(pane: AnalysisPaneSnapshot, label: string): string {
  if (!pane.filename || !pane.series || !pane.metrics) {
    return `${label}: no data loaded`
  }

  return `${label}
- filename: ${pane.filename}
- nickname: ${pane.nickname ?? 'n/a'}
- peak_force_N: ${pane.metrics.peakForceN.toFixed(2)}
- peak_force_lbf: ${pane.metrics.peakForceLbf.toFixed(2)}
- time_to_peak_ms: ${pane.metrics.timeToPeakMs.toFixed(2)}
- force_decay_ms: ${pane.metrics.forceDecayMs.toFixed(2)}
- impulse_Ns: ${pane.metrics.impulseNs.toFixed(3)}
- weapon_type: ${pane.metrics.weaponType}
- sample_points: ${JSON.stringify(samplePoints(pane.series))}`
}

function priorMemoryBlock(sections: MemorySection[]): string {
  if (sections.length === 0) return 'none'
  return sections.map((section) => `## ${section.filename}\n${section.content}`).join('\n\n')
}

export function buildAnalysisPrompt(
  panes: AnalysisPaneSnapshot[],
  userParameters: string,
  priorSections: MemorySection[],
): string {
  const activePanes = panes.filter((pane) => pane.filename && pane.series && pane.metrics)
  const filenames = activePanes.map((pane) => pane.filename!).filter(Boolean)
  const isComparison = activePanes.length > 1
  const memoryKey = filenames.length > 0 ? compositeMemoryKey(filenames) : 'unknown'

  const comparisonInstructions = isComparison
    ? `Compare the two force curves directly. Highlight similarities and differences in peak force, impulse, rise/decay timing, and overall curve shape. Relate differences to potential protective gear, strike mechanics, or experimental conditions.`
    : `Analyze this single force curve in detail.`

  const automotiveContext = `Integrate relevant automotive crash-test and concussion biomechanics context where useful: NHTSA Head Injury Criterion (HIC), NCAP head impact sled testing, FMVSS impact reporting, and peer-reviewed comparisons between automotive headform impacts and sports concussions.`

  const paneBlocks = activePanes
    .map((pane, index) => formatPaneBlock(pane, `Curve ${index + 1}`))
    .join('\n\n')

  return `Analyze the selected Whack-O-Meter force curve telemetry for HEMA impact testing.

${comparisonInstructions}
${automotiveContext}

Memory section key for this request: ${memoryKey}

Selected curves:
${paneBlocks || 'No curves loaded.'}

User analysis parameters:
${userParameters.trim() || '(none)'}

Prior memory for these files:
${priorMemoryBlock(priorSections)}

Return markdown bullets in RESULTS covering:
- **Last analyzed**: ISO timestamp
- **Peak force**: values with units
- **Summary**: 2-4 sentences
- **Automotive comparison**: relate curve metrics to crash-test / HIC context when relevant
- **Research context**: biomechanics and concussion framing
- **Observations**: concise notes
${isComparison ? '- **Comparison**: explicit similarities and differences between curves' : ''}

Keep MEMORY extremely concise but preserve key metrics, comparisons, and user parameter intent for future runs.`
}
