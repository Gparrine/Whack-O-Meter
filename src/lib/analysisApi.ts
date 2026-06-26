import { REPO_FULL } from './repoConfig'

export interface AnalysisRequest {
  prompt: string
  sectionKey: string
}

export interface AnalysisResponse {
  results: string
  memory: string
  persisted: boolean
}

function analysisApiBase(): string | null {
  const configured = (import.meta.env.VITE_ANALYSIS_API_URL as string | undefined)?.trim()
  if (configured) return configured.replace(/\/$/, '')
  return null
}

async function callDevProxy(request: AnalysisRequest): Promise<AnalysisResponse | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok) return null
    return (await response.json()) as AnalysisResponse
  } catch {
    return null
  }
}

async function callWorkerApi(request: AnalysisRequest): Promise<AnalysisResponse> {
  const base = analysisApiBase()
  if (!base) {
    throw new Error(
      'Live analysis is not configured for production yet. Set the repository variable ANALYSIS_API_URL to your deployed Cloudflare Worker URL, or run the app locally with GEMINI_API_KEY set.',
    )
  }

  const response = await fetch(`${base}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  const data = (await response.json()) as AnalysisResponse & { error?: string }
  if (!response.ok) {
    throw new Error(data.error ?? `Analysis API error (${response.status})`)
  }

  return {
    results: data.results,
    memory: data.memory,
    persisted: Boolean(data.persisted),
  }
}

export async function runAnalysisRequest(request: AnalysisRequest): Promise<AnalysisResponse> {
  const fromDev = await callDevProxy(request)
  if (fromDev) return fromDev

  if (import.meta.env.DEV) {
    throw new Error(
      'Set GEMINI_API_KEY in your shell before running npm run dev to use live analysis locally.',
    )
  }

  return callWorkerApi(request)
}

export function getRepoLinks() {
  return { full: REPO_FULL }
}
