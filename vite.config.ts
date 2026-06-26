import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Whack-O-Meter'
const base = `/${repoName}/`
const rootDir = join(import.meta.dirname)

function serveRawData(): Plugin {
  return {
    name: 'serve-raw-data',
    configureServer(server) {
      server.middlewares.use(`${base}raw_data`, (req, res, next) => {
        const requestPath = decodeURIComponent(req.url ?? '/').replace(/^\//, '')
        if (!requestPath || requestPath.includes('..')) {
          next()
          return
        }

        const filePath = join(rootDir, 'raw_data', requestPath)
        if (!existsSync(filePath)) {
          next()
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

async function callGeminiServer(prompt: string): Promise<string> {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.VITE_GEMINI_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in the dev server environment.')
  }

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash'
  const systemPrompt = `You are a sports biomechanics analyst specializing in HEMA impact force curves, concussion research, head acceleration literature, and automotive crash-test biomechanics (HIC, NCAP, sled tests). Write concise markdown bullet observations.

Always respond using EXACTLY this format:

<!-- RESULTS -->
(user-facing markdown bullets for the operator)
<!-- /RESULTS -->
<!-- MEMORY -->
(concise memory summary for future runs; lightweight, no fluff)
<!-- /MEMORY -->`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${detail.slice(0, 240)}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part) => part.text ?? '').join('').trim()
  if (!text) throw new Error('Gemini returned an empty response')
  return text
}

function parseAnalysisResponse(raw: string): { results: string; memory: string } {
  const resultsMatch = raw.match(/<!--\s*RESULTS\s*-->([\s\S]*?)<!--\s*\/RESULTS\s*-->/i)
  const memoryMatch = raw.match(/<!--\s*MEMORY\s*-->([\s\S]*?)<!--\s*\/MEMORY\s*-->/i)
  if (resultsMatch && memoryMatch) {
    return { results: resultsMatch[1]!.trim(), memory: memoryMatch[1]!.trim() }
  }
  return { results: raw.trim(), memory: raw.trim() }
}

function analyzeApiRoute(): Plugin {
  return {
    name: 'analyze-api-route',
    configureServer(server) {
      server.middlewares.use(`${base}api/analyze`, (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
          void (async () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                prompt?: string
                sectionKey?: string
              }
              if (!body.prompt?.trim() || !body.sectionKey?.trim()) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Missing prompt or sectionKey' }))
                return
              }

              const raw = await callGeminiServer(body.prompt)
              const parsed = parseAnalysisResponse(raw)
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  results: parsed.results,
                  memory: parsed.memory,
                  persisted: false,
                }),
              )
            } catch (error) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : 'Analysis failed',
                }),
              )
            }
          })()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveRawData(), analyzeApiRoute()],
  base,
})
