const SYSTEM_PROMPT = `You are a sports biomechanics analyst specializing in HEMA impact force curves, concussion research, head acceleration literature, and automotive crash-test biomechanics (HIC, NCAP, sled tests). Write concise markdown bullet observations.

On every analysis request, use Google Search to find current, authoritative data relevant to the user parameters, curve metrics, concussion thresholds, and automotive head-impact context. Cite sources in RESULTS and compress durable findings into MEMORY.

Always respond using EXACTLY this format:

<!-- RESULTS -->
(user-facing markdown bullets for the operator)
<!-- /RESULTS -->
<!-- MEMORY -->
(concise memory summary for future runs; lightweight, no fluff)
<!-- /MEMORY -->

MEMORY structure (keep terse; merge/update prior research lines; drop superseded items):
- **Last analyzed**: ISO timestamp
- **Summary**: 1-2 sentences
- **Metrics**: peak, impulse, key timing (only if notable)
### Research findings
(one line per source; max ~8 lines; format: \`- source | metric/threshold | finding\`)
- \`Org/Author\` url | metric | one-line takeaway
- **Observations**: optional brief notes

In ### Research findings, store sources and metrics efficiently so future runs can reuse them without re-searching.`

// Keep in sync with src/lib/geminiAnalysisConfig.ts
const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const WORKER_VERSION = '2025-06-26-research-findings'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function githubApiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Whack-O-Meter-Analysis-Worker',
  }
}

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
        tools: [{ google_search: {} }],
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
  const token = env.GITHUB_PAT?.trim()
  if (!token) {
    return { ok: false, error: 'GITHUB_PAT is not configured on the worker.' }
  }

  const repo = env.GITHUB_REPOSITORY || 'Gparrine/Whack-O-Meter'
  const path = 'analysis/memory.md'
  const getUrl = `https://api.github.com/repos/${repo}/contents/${path}`
  const headers = githubApiHeaders(token)

  const getResponse = await fetch(getUrl, { headers })

  let sha
  let markdown =
    '# Whack-O-Meter Analysis Memory\n\n> Auto-updated by AI analysis pipeline. Do not edit structure headers.\n\n'
  if (getResponse.ok) {
    const existing = await getResponse.json()
    sha = existing.sha
    markdown = decodeURIComponent(escape(atob(existing.content.replace(/\n/g, ''))))
  } else if (getResponse.status !== 404) {
    const detail = await getResponse.text()
    return {
      ok: false,
      error: `Failed to read analysis/memory.md (${getResponse.status}): ${detail.slice(0, 220)}`,
    }
  }

  const sections = parseSections(markdown)
  sections[sectionKey] = memoryContent.trim()
  const nextMarkdown = renderMemory(sections)

  const putResponse = await fetch(getUrl, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Update analysis memory for ${sectionKey}`,
      content: btoa(unescape(encodeURIComponent(nextMarkdown))),
      sha,
      branch: 'main',
    }),
  })

  if (!putResponse.ok) {
    const detail = await putResponse.text()
    return {
      ok: false,
      error: `Failed to commit analysis/memory.md (${putResponse.status}): ${detail.slice(0, 220)}`,
    }
  }

  return { ok: true }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      return Response.json(
        {
          ok: true,
          service: 'whack-o-meter-analysis',
          model: GEMINI_MODEL,
          version: WORKER_VERSION,
          githubPatConfigured: Boolean(env.GITHUB_PAT?.trim()),
          githubRepository: env.GITHUB_REPOSITORY || 'Gparrine/Whack-O-Meter',
        },
        { headers: CORS_HEADERS },
      )
    }

    if (request.method !== 'POST' || url.pathname !== '/analyze') {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS })
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
      const persistResult = await persistMemory(env, sectionKey, parsed.memory)

      return Response.json(
        {
          text: raw,
          results: parsed.results,
          memory: parsed.memory,
          persisted: persistResult.ok,
          persistError: persistResult.ok ? undefined : persistResult.error,
        },
        {
          headers: {
            ...CORS_HEADERS,
            'X-Gemini-Model': GEMINI_MODEL,
            'X-Worker-Version': WORKER_VERSION,
          },
        },
      )
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Analysis failed' },
        {
          status: 500,
          headers: CORS_HEADERS,
        },
      )
    }
  },
}
