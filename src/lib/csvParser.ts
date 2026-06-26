import Papa from 'papaparse'

export interface ParsedSeries {
  time: number[]
  force: number[]
  timeLabel: string
  forceLabel: string
}

const TIME_PATTERNS = [
  /^time/i,
  /^timestamp/i,
  /^t$/i,
  /^t_/i,
  /ms$/i,
  /seconds?$/i,
  /sec$/i,
]

const FORCE_PATTERNS = [
  /^force/i,
  /^g$/i,
  /^g_/i,
  /accel/i,
  /^impact/i,
  /newton/i,
  /_n$/i,
  /^n$/i,
]

function isNumericColumn(values: unknown[]): boolean {
  const numeric = values.filter((v) => {
    if (v === null || v === undefined || v === '') return false
    return !Number.isNaN(Number(v))
  })
  return numeric.length >= values.length * 0.8
}

function matchColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = headers.find((h) => pattern.test(h.trim()))
    if (match) return match
  }
  return null
}

function normalizeTime(values: number[], header: string): number[] {
  const isMilliseconds = /ms/i.test(header) && !/seconds?/i.test(header)
  const start = values[0] ?? 0
  return values.map((v) => {
    const seconds = isMilliseconds ? v / 1000 : v
    return seconds - start
  })
}

export function parseForceCsv(text: string): ParsedSeries {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? 'Failed to parse CSV')
  }

  const rows = result.data.filter((row) => Object.values(row).some((v) => v !== ''))
  if (rows.length === 0) {
    throw new Error('CSV file is empty')
  }

  const headers = result.meta.fields ?? Object.keys(rows[0] ?? {})
  const numericHeaders = headers.filter((header) =>
    isNumericColumn(rows.map((row) => row[header])),
  )

  const timeHeader =
    matchColumn(headers, TIME_PATTERNS) ??
    numericHeaders.find((h) => TIME_PATTERNS.some((p) => p.test(h))) ??
    numericHeaders[0] ??
    null

  const forceHeader =
    matchColumn(headers, FORCE_PATTERNS) ??
    numericHeaders.find((h) => h !== timeHeader && FORCE_PATTERNS.some((p) => p.test(h))) ??
    numericHeaders.find((h) => h !== timeHeader) ??
    null

  if (!timeHeader || !forceHeader) {
    throw new Error(
      `Could not detect time and force columns. Found headers: ${headers.join(', ')}`,
    )
  }

  const time = rows.map((row) => Number(row[timeHeader]))
  const force = rows.map((row) => Number(row[forceHeader]))

  if (time.some(Number.isNaN) || force.some(Number.isNaN)) {
    throw new Error('Time and force columns must contain numeric values')
  }

  return {
    time: normalizeTime(time, timeHeader),
    force,
    timeLabel: timeHeader,
    forceLabel: forceHeader,
  }
}
