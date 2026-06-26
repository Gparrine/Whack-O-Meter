import { DEFAULT_GEMINI_MODEL } from './repoConfig'

const SYSTEM_PROMPT = `You are a sports biomechanics analyst specializing in HEMA impact force curves, concussion research, head acceleration literature, and automotive crash-test biomechanics (HIC, NCAP, sled tests). Write concise markdown bullet observations.

Always respond using EXACTLY this format:

<!-- RESULTS -->
(user-facing markdown bullets for the operator)
<!-- /RESULTS -->
<!-- MEMORY -->
(concise memory summary for future runs; lightweight, no fluff)
<!-- /MEMORY -->`

export async function callGemini(apiKey: string, prompt: string, model = DEFAULT_GEMINI_MODEL): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${detail.slice(0, 240)}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part) => part.text ?? '').join('').trim()
  if (!text) {
    throw new Error('Gemini returned an empty response')
  }
  return text
}
