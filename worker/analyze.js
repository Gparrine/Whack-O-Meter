const SYSTEM_PROMPT = `You are a sports biomechanics analyst specializing in HEMA impact force curves, concussion research, head acceleration literature, and automotive crash-test biomechanics (HIC, NCAP, sled tests). Write concise markdown bullet observations.

Always respond using EXACTLY this format:

<!-- RESULTS -->
(user-facing markdown bullets for the operator)
<!-- /RESULTS -->
<!-- MEMORY -->
(concise memory summary for future runs; lightweight, no fluff)
<!-- /MEMORY -->`

// Hardcoded so a stale Cloudflare secret named GEMINI_MODEL cannot override this.
const GEMINI_MODEL = 'gemini-3.5-flash'

async function callGemini(env, prompt) {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the analysis worker.')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Gemini API error (${response.status}) for model ${GEMINI_MODEL}: ${detail.slice(0, 240)}`,
    )
  }

  const data = await response.json()
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part) => part.text ?? '').join('').trim()
  if (!text) throw new Error('Gemini returned an empty response')
  return text
}

function parseAnalysisResponse(raw) {
  const resultsMatch = raw.match(/<!--\s*RESULTS\s*-->([\s\S]*?)<!--\s*\/RESULTS\s*-->/i)
  const memoryMatch = raw.match(/<!--\s*MEMORY\s*-->([\s\S]*?)<!--\s*\/MEMORY\s*-->/i)
  if (resultsMatch && memoryMatch) {
    return {
      results: resultsMatch[1].trim(),
      memory: memoryMatch[1].trim(),
    }
  }
  return { results: raw.trim(), memory: raw.trim() }
}

function parseSections(markdown) {
  const sections = {}
  const parts = markdown.split(/^## /m).slice(1)
  for (const part of parts) {
    const newline = part.indexOf('\n')
    if (newline === -1) continue
    const filename = part.slice(0, newline).trim()
    sections[filename] = part.slice(newline + 1).trim()
  }
  return sections
}

function renderMemory(sections) {
  const header =
    '# Whack-O-Meter Analysis Memory\n\n' +
    '> Auto-updated by AI analysis pipeline. Do not edit structure headers.\n\n'
  const body = Object.keys(sections)
    .sort()
    .map((filename) => `## ${filename}\n${sections[filename].trim()}\n`)
    .join('\n')
  return header + body
}

async function persistMemory(env, sectionKey, memoryContent) {
  const token = env.GITHUB_PAT
  if (!token) return false

  const repo = env.GITHUB_REPOSITORY || 'Gparrine/Whack-O-Meter'
  const path = 'analysis/memory.md'
  const getUrl = `https://api.github.com/repos/${repo}/contents/${path}`

  const getResponse = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  let sha
  let markdown = '# Whack-O-Meter Analysis Memory\n\n> Auto-updated by AI analysis pipeline. Do not edit structure headers.\n\n'
  if (getResponse.ok) {
    const existing = await getResponse.json()
    sha = existing.sha
    markdown = decodeURIComponent(escape(atob(existing.content.replace(/\n/g, ''))))
  }

  const sections = parseSections(markdown)
  sections[sectionKey] = memoryContent.trim()
  const nextMarkdown = renderMemory(sections)

  const putResponse = await fetch(getUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `Update analysis memory for ${sectionKey}`,
      content: btoa(unescape(encodeURIComponent(nextMarkdown))),
      sha,
      branch: 'main',
    }),
  })

  return putResponse.ok
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (request.method !== 'POST' || url.pathname !== '/analyze') {
      return new Response('Not found', { status: 404 })
    }

    try {
      const body = await request.json()
      const prompt = body.prompt?.trim()
      const sectionKey = body.sectionKey?.trim()
      if (!prompt || !sectionKey) {
        return Response.json({ error: 'Missing prompt or sectionKey' }, { status: 400 })
      }

      const raw = await callGemini(env, prompt)
      const parsed = parseAnalysisResponse(raw)
      const persisted = await persistMemory(env, sectionKey, parsed.memory)

      return Response.json(
        {
          text: raw,
          results: parsed.results,
          memory: parsed.memory,
          persisted,
        },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Analysis failed' },
        {
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
    }
  },
}
