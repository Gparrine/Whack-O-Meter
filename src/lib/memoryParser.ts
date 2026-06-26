export interface ParsedAnalysisResponse {
  results: string
  memory: string
}

const RESULTS_PATTERN = /<!--\s*RESULTS\s*-->([\s\S]*?)<!--\s*\/RESULTS\s*-->/
const MEMORY_PATTERN = /<!--\s*MEMORY\s*-->([\s\S]*?)<!--\s*\/MEMORY\s*-->/

export function parseAnalysisResponse(raw: string): ParsedAnalysisResponse {
  const resultsMatch = raw.match(RESULTS_PATTERN)
  const memoryMatch = raw.match(MEMORY_PATTERN)

  if (resultsMatch && memoryMatch) {
    return {
      results: resultsMatch[1]!.trim(),
      memory: memoryMatch[1]!.trim(),
    }
  }

  return {
    results: raw.trim(),
    memory: raw.trim(),
  }
}

export function compositeMemoryKey(filenames: string[]): string {
  return [...filenames].sort().join(' + ')
}

export function mergeMemorySection(
  markdown: string,
  sectionKey: string,
  content: string,
): string {
  const header = '# Whack-O-Meter Analysis Memory'
  const notice =
    '> Auto-updated by AI analysis pipeline. Do not edit structure headers.\n\n'

  let body = markdown
  if (!body.trim()) {
    body = `${header}\n\n${notice}`
  }

  const sections = parseMemorySections(body)
  const existing = sections.find((section) => section.filename === sectionKey)
  const nextSections = existing
    ? sections.map((section) =>
        section.filename === sectionKey ? { ...section, content: content.trim() } : section,
      )
    : [...sections, { filename: sectionKey, content: content.trim() }]

  const sorted = [...nextSections].sort((a, b) => a.filename.localeCompare(b.filename))
  return `${header}\n\n${notice}${sorted.map((section) => `## ${section.filename}\n${section.content.trim()}\n`).join('\n')}`
}

export interface MemorySection {
  filename: string
  content: string
}

export function parseMemorySections(markdown: string): MemorySection[] {
  const sections: MemorySection[] = []
  const parts = markdown.split(/^## /m).slice(1)

  for (const part of parts) {
    const newline = part.indexOf('\n')
    if (newline === -1) continue
    const filename = part.slice(0, newline).trim()
    const content = part.slice(newline + 1).trim()
    sections.push({ filename, content })
  }

  return sections
}

export function getSectionForFile(
  sections: MemorySection[],
  filename: string,
): MemorySection | undefined {
  return sections.find((section) => section.filename === filename)
}

export function getSectionsForFiles(
  sections: MemorySection[],
  filenames: string[],
): MemorySection[] {
  const cleaned = filenames.filter(Boolean)
  if (cleaned.length === 0) return []

  const matches = new Map<string, MemorySection>()
  for (const filename of cleaned) {
    const single = getSectionForFile(sections, filename)
    if (single) matches.set(single.filename, single)
  }

  if (cleaned.length > 1) {
    const composite = getSectionForFile(sections, compositeMemoryKey(cleaned))
    if (composite) matches.set(composite.filename, composite)
  }

  return [...matches.values()]
}

const RESEARCH_FINDINGS_PATTERN =
  /### Research findings\s*\n([\s\S]*?)(?=\n### |\n- \*\*[A-Z][^\n]*\*\*:|\s*$)/i

export function extractResearchFindings(content: string): string {
  const match = content.match(RESEARCH_FINDINGS_PATTERN)
  return match?.[1]?.trim() ?? ''
}

export function collectResearchFindingsForPrompt(sections: MemorySection[]): string {
  const blocks = sections
    .map((section) => {
      const findings = extractResearchFindings(section.content)
      if (!findings) return null
      return `From ${section.filename}:\n${findings}`
    })
    .filter((block): block is string => Boolean(block))

  return blocks.length > 0 ? blocks.join('\n\n') : 'none'
}

export async function loadMemoryMarkdown(): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}analysis/memory.md`)
  if (!response.ok) {
    throw new Error('Failed to load analysis memory')
  }
  return response.text()
}
