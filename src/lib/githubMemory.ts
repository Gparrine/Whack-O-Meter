import { MEMORY_PATH, REPO_FULL, REPO_OWNER, REPO_NAME } from './repoConfig'

interface GitHubContentResponse {
  sha?: string
}

export async function persistMemoryMarkdown(
  pat: string,
  markdown: string,
  commitMessage = 'Update AI analysis memory from Whack-O-Meter UI',
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const getUrl = `https://api.github.com/repos/${REPO_FULL}/contents/${MEMORY_PATH}`
  const getResponse = await fetch(getUrl, { headers })
  let sha: string | undefined

  if (getResponse.ok) {
    const existing = (await getResponse.json()) as GitHubContentResponse
    sha = existing.sha
  } else if (getResponse.status !== 404) {
    const detail = await getResponse.text()
    throw new Error(`Failed to read analysis memory (${getResponse.status}): ${detail.slice(0, 200)}`)
  }

  const putResponse = await fetch(getUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: commitMessage,
      content: btoa(unescape(encodeURIComponent(markdown))),
      sha,
      branch: 'main',
    }),
  })

  if (!putResponse.ok) {
    const detail = await putResponse.text()
    throw new Error(`Failed to save analysis memory (${putResponse.status}): ${detail.slice(0, 240)}`)
  }
}

export function getRepoLinks() {
  return {
    owner: REPO_OWNER,
    name: REPO_NAME,
    full: REPO_FULL,
  }
}
