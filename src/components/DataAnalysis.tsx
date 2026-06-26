import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useErrors } from '../lib/errors'
import {
  getSectionForFile,
  loadMemoryMarkdown,
  parseMemorySections,
  type MemorySection,
} from '../lib/memoryParser'

interface DataAnalysisProps {
  filename: string | null
}

export function DataAnalysis({ filename }: DataAnalysisProps) {
  const { reportError, clearSource } = useErrors()
  const [sections, setSections] = useState<MemorySection[]>([])
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(false)

  const refreshMemory = useCallback(async () => {
    setLoading(true)
    clearSource('Analysis')
    try {
      const markdown = await loadMemoryMarkdown()
      setSections(parseMemorySections(markdown))
    } catch (err) {
      reportError(
        'Analysis',
        err instanceof Error ? err.message : 'Failed to load analysis memory',
      )
    } finally {
      setLoading(false)
    }
  }, [reportError, clearSource])

  useEffect(() => {
    void refreshMemory()
  }, [refreshMemory])

  useEffect(() => {
    if (!polling) return undefined
    const timer = window.setInterval(() => {
      void refreshMemory()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [polling, refreshMemory])

  const section = filename ? getSectionForFile(sections, filename) : undefined

  return (
    <section className="analysis-panel panel">
      <h2 className="section-title">Data Analysis</h2>
      {loading && !section ? <p className="status-text">Loading analysis memory...</p> : null}
      {section ? (
        <div className="analysis-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
        </div>
      ) : (
        <p className="analysis-empty">
          No AI analysis stored yet for{' '}
          {filename ?? 'this file'}. Run the GitHub Actions workflow to analyze CSV curves and
          search related sports-science research.
        </p>
      )}
      <div className="analysis-actions">
        <button type="button" className="action-button" onClick={() => void refreshMemory()}>
          Refresh Analysis
        </button>
        <button
          type="button"
          className="action-button"
          onClick={() => setPolling((value) => !value)}
        >
          {polling ? 'Stop Checking Updates' : 'Check for Updates'}
        </button>
        <a
          className="action-button"
          href="https://github.com/Gparrine/Whack-O-Meter/actions/workflows/analyze.yml"
          target="_blank"
          rel="noreferrer"
        >
          Run AI Analysis Workflow
        </a>
      </div>
      {polling ? (
        <p className="status-text">Polling analysis memory every 5 seconds...</p>
      ) : null}
    </section>
  )
}
