export interface ParsedAxisLabels {
  sensorName: string
  forceUnit: string
  forceAxisLabel: string
  timeAxisLabel: string
  sensorFootnote: string
}

const DEFAULT_SENSOR = 'Whackometer 2-0'
const LOADSTAR_FOOTNOTE =
  'Whackometer = Loadstar LV-1000HS-10K 50kHz condensed here to 1kHz'

export function parseAxisLabels(forceHeader: string): ParsedAxisLabels {
  const unitMatch = forceHeader.match(/\((N|lbf|kN)\)/i)
  const forceUnit = unitMatch ? `(${unitMatch[1]!.toUpperCase() === 'N' ? 'N' : unitMatch[1]})` : '(N)'

  const parenGroups = [...forceHeader.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!.trim())
  const sensorName =
    parenGroups.find((group) => !/^(N|lbf|kN)$/i.test(group)) ??
    (forceHeader.replace(/\([^)]*\)/g, '').replace(/Reading\s*/i, '').trim() || DEFAULT_SENSOR)

  return {
    sensorName,
    forceUnit,
    forceAxisLabel: `Reading ${forceUnit}`,
    timeAxisLabel: 'Value (ms)',
    sensorFootnote: LOADSTAR_FOOTNOTE,
  }
}

export function defaultAxisLabels(): ParsedAxisLabels {
  return parseAxisLabels(`Reading (N) (${DEFAULT_SENSOR})`)
}
