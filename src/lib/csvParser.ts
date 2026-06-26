export interface CsvMetadata {
  nickname?: string
  eventStart?: number
  eventEnd?: number
  prefixTrimStart?: number
  prefixTrimEnd?: number
  suffixTrimStart?: number
  suffixTrimEnd?: number
  originalStart?: number
  originalEnd?: number
  baseline?: number
  originalSampleCount?: number
  samplesPerSec?: number
}

export interface ParsedSeries {
  time: number[]
  force: number[]
  absoluteTime: number[]
  timeLabel: string
  forceLabel: string
  metadata: CsvMetadata
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
  /reading/i,
  /_n$/i,
  /^n$/i,
]

function parseManagerLine(line: string, metadata: CsvMetadata): void {
  const trimmed = line.replace(/^#\s*/, '').trim()
  const nicknameMatch = trimmed.match(/^Nickname:\s*(.+)$/i)
  if (nicknameMatch) {
    metadata.nickname = nicknameMatch[1]?.trim()
    return
  }

  const mappings: Array<[RegExp, (...values: string[]) => void]> = [
    [/^Original samples:\s*(\d+)/i, (v) => { metadata.originalSampleCount = Number(v) }],
    [/^Samples\/sec:\s*([\d.]+)/i, (v) => { metadata.samplesPerSec = Number(v) }],
    [/^Event start:\s*([\d.]+)\s*sec/i, (v) => { metadata.eventStart = Number(v) }],
    [/^Event end:\s*([\d.]+)\s*sec/i, (v) => { metadata.eventEnd = Number(v) }],
    [/^Baseline \(N\):\s*([-\d.]+)/i, (v) => { metadata.baseline = Number(v) }],
    [
      /^Prefix trimmed:\s*([\d.]+)\s*-\s*([\d.]+)\s*sec/i,
      (v, v2) => {
        metadata.prefixTrimStart = Number(v)
        metadata.prefixTrimEnd = Number(v2)
      },
    ],
    [
      /^Suffix trimmed:\s*([\d.]+)\s*-\s*([\d.]+)\s*sec/i,
      (v, v2) => {
        metadata.suffixTrimStart = Number(v)
        metadata.suffixTrimEnd = Number(v2)
      },
    ],
  ]

  for (const [pattern, setter] of mappings) {
    const match = trimmed.match(pattern)
    if (!match) continue
    setter(...match.slice(1))
    return
  }
}

function preprocessCsvText(text: string): { dataText: string; metadata: CsvMetadata } {
  const metadata: CsvMetadata = {}
  const lines = text.split(/\r?\n/)
  const dataLines: string[] = []
  let dataStarted = false

  for (const line of lines) {
    if (!dataStarted) {
      if (line.startsWith('#')) {
        parseManagerLine(line, metadata)
        continue
      }

      const lower = line.toLowerCase()
      if (
        lower.includes('time') &&
        (lower.includes('reading') ||
          lower.includes('force') ||
          lower.includes('(n)') ||
          lower.includes('impact') ||
          /(?:^|_)g(?:_|$)/i.test(line))
      ) {
        dataStarted = true
        dataLines.push(line)
        continue
      }

      if (line.trim() === '') continue
      continue
    }

    dataLines.push(line)
  }

  return { dataText: dataLines.join('\n'), metadata }
}

function isNumericColumn(values: string[]): boolean {
  const numeric = values.filter((v) => v !== '' && !Number.isNaN(Number(v)))
  return numeric.length >= values.length * 0.8
}

function matchColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = headers.find((h) => pattern.test(h.trim()))
    if (match) return match
  }
  return null
}

function parseDataRows(dataText: string): {
  rows: Record<string, string>[]
  headers: string[]
} {
  const lines = dataText.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) {
    throw new Error('CSV file has no data rows')
  }

  const headers = lines[0]!.split(',').map((h) => h.trim())
  const rows: Record<string, string>[] = []

  for (const line of lines.slice(1)) {
    const values = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? '').trim()
    })
    if (Object.values(row).some((v) => v !== '')) {
      rows.push(row)
    }
  }

  return { rows, headers }
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
  const { dataText, metadata } = preprocessCsvText(text)
  const { rows, headers } = parseDataRows(dataText)

  if (rows.length === 0) {
    throw new Error('CSV file is empty')
  }

  const numericHeaders = headers.filter((header) =>
    isNumericColumn(rows.map((row) => row[header] ?? '')),
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

  const absoluteTime = rows.map((row) => Number(row[timeHeader]))
  const force = rows.map((row) => Number(row[forceHeader]))

  if (absoluteTime.some(Number.isNaN) || force.some(Number.isNaN)) {
    throw new Error('Time and force columns must contain numeric values')
  }

  if (metadata.originalStart === undefined) {
    metadata.originalStart = absoluteTime[0]
  }
  if (metadata.originalEnd === undefined) {
    metadata.originalEnd = absoluteTime[absoluteTime.length - 1]
  }

  return {
    time: normalizeTime(absoluteTime, timeHeader),
    absoluteTime,
    force,
    timeLabel: timeHeader,
    forceLabel: forceHeader,
    metadata,
  }
}

export function expandFullTimeline(series: ParsedSeries): ParsedSeries {
  const { metadata } = series
  const baseline = metadata.baseline ?? series.force[0] ?? 0

  if (
    metadata.prefixTrimEnd === undefined ||
    metadata.suffixTrimStart === undefined ||
    metadata.originalStart === undefined
  ) {
    return series
  }

  const prefixStart = metadata.prefixTrimStart ?? metadata.originalStart
  const prefixEnd = metadata.prefixTrimEnd
  const suffixStart = metadata.suffixTrimStart
  const suffixEnd = metadata.suffixTrimEnd ?? metadata.originalEnd ?? suffixStart

  const prefixPoints = 2
  const suffixPoints = 2

  const prefixTime =
    prefixPoints <= 1
      ? [prefixStart]
      : Array.from({ length: prefixPoints }, (_, i) => {
          const ratio = i / (prefixPoints - 1)
          return prefixStart + (prefixEnd - prefixStart) * ratio
        })
  const prefixForce = prefixTime.map(() => baseline)

  const suffixTime =
    suffixPoints <= 1
      ? [suffixStart]
      : Array.from({ length: suffixPoints }, (_, i) => {
          const ratio = i / (suffixPoints - 1)
          return suffixStart + (suffixEnd - suffixStart) * ratio
        })
  const suffixForce = suffixTime.map(() => baseline)

  const absoluteTime = [...prefixTime, ...series.absoluteTime, ...suffixTime]
  const force = [...prefixForce, ...series.force, ...suffixForce]
  const start = absoluteTime[0] ?? 0

  return {
    ...series,
    absoluteTime,
    force,
    time: absoluteTime.map((value) => value - start),
  }
}
