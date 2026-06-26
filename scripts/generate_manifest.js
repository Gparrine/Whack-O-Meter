import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const rawDir = join(root, 'raw_data')
const publicDataDir = join(root, 'public', 'data')
const publicAnalysisDir = join(root, 'public', 'analysis')
const memorySource = join(root, 'analysis', 'memory.md')
const memoryDest = join(publicAnalysisDir, 'memory.md')

const repo = process.env.GITHUB_REPOSITORY ?? 'Gparrine/Whack-O-Meter'
const branch = process.env.GITHUB_REF_NAME ?? 'main'
const rawBase = `https://raw.githubusercontent.com/${repo}/${branch}/raw_data`

mkdirSync(rawDir, { recursive: true })
mkdirSync(publicDataDir, { recursive: true })
mkdirSync(publicAnalysisDir, { recursive: true })

const stalePublicRawDir = join(root, 'public', 'raw_data')
if (existsSync(stalePublicRawDir)) {
  rmSync(stalePublicRawDir, { recursive: true, force: true })
}

const files = readdirSync(rawDir)
  .filter((name) => name.toLowerCase().endsWith('.csv'))
  .sort()

const manifest = {
  generatedAt: new Date().toISOString(),
  repo,
  branch,
  files: files.map((filename) => ({
    filename,
    title: filename.replace(/\.csv$/i, '').replace(/[_-]+/g, ' '),
    path: `raw_data/${filename}`,
    rawUrl: `${rawBase}/${encodeURIComponent(filename).replace(/%2F/g, '/')}`,
  })),
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
