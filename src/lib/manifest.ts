export interface ManifestEntry {
  filename: string
  title: string
  path: string
}

export interface Manifest {
  generatedAt: string
  files: ManifestEntry[]
}

export async function loadManifest(): Promise<Manifest> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/manifest.json`)
  if (!response.ok) {
    throw new Error('Failed to load CSV manifest')
  }
  return response.json() as Promise<Manifest>
}

export async function loadCsvText(path: string): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }
  return response.text()
}
