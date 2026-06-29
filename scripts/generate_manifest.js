import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const rawDir = join(root, 'raw_data')
const publicDataDir = join(root, 'public', 'data')
const publicAnalysisDir = join(root, 'public', 'analysis')
const memorySource = join(root, 'analysis', 'memory.md')
const memoryDest = join(publicAnalysisDir, 'memory.md')
const managerMemorySource = join(rawDir, 'csv_manager_memory.md')

const repo = process.env.GITHUB_REPOSITORY ?? 'Gparrine/Whack-O-Meter'
const branch = process.env.GITHUB_REF_NAME ?? 'main'
const rawBase = `https://raw.githubusercontent.com/${repo}/${branch}/raw_data`

function parseManagerMemory(markdown) {
  const sections = new Map()
  const parts = markdown.split(/^## /m).slice(1)
  for (const part of parts) {
    const newline = part.indexOf('\n')
    if (newline === -1) continue
    const key = part.slice(0, newline).trim()
    const body = part.slice(newline + 1)
    sections.set(key, body)
  }
  return sections
}

function readField(body, label) {
  const match = body.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*(.+)$`, 'm'))
  return match?.[1]?.trim()
}

function readNumber(body, label) {
  const value = readField(body, label)
  if (!value) return undefined
  const match = value.match(/[-\d.]+/)
  return match ? Number(match[0]) : undefined
}

function readRange(body, label) {
  const value = readField(body, label)
  if (!value) return {}
  const match = value.match(/([-\d.]+)\s*[–-]\s*([-\d.]+)/)
  if (!match) return {}
  return { start: Number(match[1]), end: Number(match[2]) }
}

function buildCatalog(body) {
  const peakField = readField(body, 'Peak')
  const peakMatch = peakField?.match(/([-\d.]+)\s*N\s*\(([-\d.]+)\s*lbf\)/i)
  const eventWindow = readRange(body, 'Event window')
  const prefixTrimmed = readRange(body, 'Prefix trimmed')
  const suffixTrimmed = readRange(body, 'Suffix trimmed')

  return {
    nickname: readField(body, 'Nickname'),
    category: readField(body, 'Category'),
    metrics: peakMatch
      ? {
          peakForceN: Number(peakMatch[1]),
          peakForceLbf: Number(peakMatch[2]),
          timeToPeakMs: readNumber(body, 'Time to peak') ?? 0,
          forceDecayMs: readNumber(body, 'Force decay') ?? 0,
          impulseNs: readNumber(body, 'Impulse') ?? 0,
          weaponType: readField(body, 'Weapon type') ?? 'Steel Test Ball Drop',
        }
      : undefined,
    trimMeta: {
      eventStart: eventWindow.start,
      eventEnd: eventWindow.end,
      prefixTrimStart: prefixTrimmed.start,
      prefixTrimEnd: prefixTrimmed.end,
      suffixTrimStart: suffixTrimmed.start,
      suffixTrimEnd: suffixTrimmed.end,
      originalStart: prefixTrimmed.start,
      originalEnd: suffixTrimmed.end,
    },
  }
}

function discoverCsvFiles(dir, prefix = '') {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const absolutePath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...discoverCsvFiles(absolutePath, relativePath))
      continue
    }
    if (!entry.name.toLowerCase().endsWith('.csv')) continue
    if (entry.name === 'csv_manager_memory.md') continue
    results.push(relativePath)
  }
  return results
}

function encodeRawUrl(relativePath) {
  return `${rawBase}/${relativePath.split('/').map(encodeURIComponent).join('/')}`
}

mkdirSync(rawDir, { recursive: true })
mkdirSync(publicDataDir, { recursive: true })
mkdirSync(publicAnalysisDir, { recursive: true })

const stalePublicRawDir = join(root, 'public', 'raw_data')
if (existsSync(stalePublicRawDir)) {
  rmSync(stalePublicRawDir, { recursive: true, force: true })
}

const managerSections = existsSync(managerMemorySource)
  ? parseManagerMemory(readFileSync(managerMemorySource, 'utf-8'))
  : new Map()

const files = discoverCsvFiles(rawDir).sort()

const manifest = {
  generatedAt: new Date().toISOString(),
  repo,
  branch,
  files: files.map((relativePath) => {
    const basename = relativePath.split('/').pop() ?? relativePath
    const category = relativePath.includes('/') ? relativePath.split('/')[0] : undefined
    const catalog = managerSections.has(relativePath)
      ? buildCatalog(managerSections.get(relativePath))
      : managerSections.has(basename)
        ? buildCatalog(managerSections.get(basename))
        : {}
    return {
      filename: relativePath,
      title: basename.replace(/\.csv$/i, '').replace(/[_-]+/g, ' '),
      nickname: catalog.nickname,
      category: catalog.category ?? category,
      path: `raw_data/${relativePath}`,
      rawUrl: encodeRawUrl(relativePath),
      metrics: catalog.metrics,
      trimMeta: catalog.trimMeta,
    }
  }),
}

writeFileSync(join(publicDataDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

if (existsSync(memorySource)) {
  cpSync(memorySource, memoryDest, { force: true })
} else {
  writeFileSync(
    memoryDest,
    '# Whack-O-Meter Analysis Memory\n\n> Auto-updated by AI analysis pipeline.\n',
  )
}

console.log(`Generated manifest with ${files.length} CSV file(s).`)
