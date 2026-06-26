import { useCallback, useMemo, useState } from 'react'

function appShareUrl(): string {
  const base = import.meta.env.BASE_URL
  return new URL(base, window.location.origin).href
}

function embedCode(shareUrl: string): string {
  return `<iframe src="${shareUrl}" title="Whack-O-Meter" width="100%" height="800" style="border:0;" loading="lazy" allowfullscreen></iframe>`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function AppFooter() {
  const shareUrl = useMemo(() => (typeof window === 'undefined' ? '' : appShareUrl()), [])
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const handleCopy = useCallback(async (label: string, text: string) => {
    const ok = await copyText(text)
    setCopyStatus(ok ? `${label} copied` : `Could not copy ${label.toLowerCase()}`)
    window.setTimeout(() => setCopyStatus(null), 2000)
  }, [])

  return (
    <footer className="app-footer">
      <div className="app-footer-left">
        <button
          type="button"
          className="action-button app-footer-button"
          onClick={() => void handleCopy('Link', shareUrl)}
        >
          Copy Link
        </button>
        <button
          type="button"
          className="action-button app-footer-button"
          onClick={() => void handleCopy('Embed code', embedCode(shareUrl))}
        >
          Copy Embed Code
        </button>
        {copyStatus ? <span className="app-footer-status">{copyStatus}</span> : null}
      </div>
      <p className="app-footer-copy">©2026 Flashing5word</p>
    </footer>
  )
}
