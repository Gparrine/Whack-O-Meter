import { callGemini } from './geminiClient'

function configuredGeminiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ''
}

function configuredGithubPat(): string {
  return (import.meta.env.VITE_GITHUB_COMMIT_PAT as string | undefined)?.trim() ?? ''
}

async function callAnalyzeProxy(prompt: string): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { text?: string }
    return data.text?.trim() ?? null
  } catch {
    return null
  }
}

export async function runAnalysisPrompt(prompt: string): Promise<string> {
  const fromProxy = await callAnalyzeProxy(prompt)
  if (fromProxy) return fromProxy

  const apiKey = configuredGeminiKey()
  if (!apiKey) {
    throw new Error(
      'Analysis is not configured. Set GEMINI_API_KEY in the deploy environment or local shell before running npm run dev.',
    )
  }

  return callGemini(apiKey, prompt)
}

export function getConfiguredGithubPat(): string {
  return configuredGithubPat()
}

export function canPersistMemory(): boolean {
  return configuredGithubPat().length > 0
}
