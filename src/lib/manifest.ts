export interface TrimMeta {
  eventStart?: number
  eventEnd?: number
  prefixTrimStart?: number
  prefixTrimEnd?: number
  suffixTrimStart?: number
  suffixTrimEnd?: number
  originalStart?: number
  originalEnd?: number
  baseline?: number
}

export interface FileMetrics {
  peakForceN: number
  peakForceLbf: number
  timeToPeakMs: number
  forceDecayMs: number
  impulseNs: number
  weaponType: string
}

export interface ManifestEntry {
  filename: string
  title: string
  nickname?: string
  category?: string
  path: string
  rawUrl: string
  metrics?: FileMetrics
  trimMeta?: TrimMeta
}

export interface Manifest {
  generatedAt: string
  repo: string
  branch: string
  files: ManifestEntry[]
}

export async function loadManifest(): Promise<Manifest> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/manifest.json`)
  if (!response.ok) {
    throw new Error('Failed to load CSV manifest')
  }
  return response.json() as Promise<Manifest>
}

export async function loadCsvText(entry: ManifestEntry): Promise<string> {
  const localUrl = `${import.meta.env.BASE_URL}${entry.path}`
  const candidates = import.meta.env.DEV
    ? [localUrl, entry.rawUrl]
    : [entry.rawUrl, localUrl]

  let lastError = `Failed to load ${entry.filename}`
  for (const url of candidates) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return response.text()
      }
      lastError = `Failed to load ${entry.filename} (${response.status})`
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
    }
  }

  throw new Error(lastError)
}
