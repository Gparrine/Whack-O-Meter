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

export async function loadMemoryMarkdown(): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}analysis/memory.md`)
  if (!response.ok) {
    throw new Error('Failed to load analysis memory')
  }
  return response.text()
}
