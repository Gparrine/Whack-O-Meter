import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const rawDir = join(root, 'raw_data')
const publicRawDir = join(root, 'public', 'raw_data')
const publicDataDir = join(root, 'public', 'data')
const publicAnalysisDir = join(root, 'public', 'analysis')
const memorySource = join(root, 'analysis', 'memory.md')
const memoryDest = join(publicAnalysisDir, 'memory.md')

mkdirSync(rawDir, { recursive: true })
mkdirSync(publicDataDir, { recursive: true })
mkdirSync(publicRawDir, { recursive: true })
mkdirSync(publicAnalysisDir, { recursive: true })

const files = readdirSync(rawDir)
  .filter((name) => name.toLowerCase().endsWith('.csv'))
  .sort()

for (const file of files) {
  cpSync(join(rawDir, file), join(publicRawDir, file), { force: true })
}

const manifest = {
  generatedAt: new Date().toISOString(),
  files: files.map((filename) => ({
    filename,
    title: filename.replace(/\.csv$/i, '').replace(/[_-]+/g, ' '),
    path: `raw_data/${filename}`,
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
