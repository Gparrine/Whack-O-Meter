import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAnalysisPrompt } from '../lib/analysisPrompt'
import { runAnalysisRequest } from '../lib/analysisApi'
import type { AnalysisPaneSnapshot } from '../lib/graphPane'
import { useErrors } from '../lib/errors'
import {
  compositeMemoryKey,
  getSectionsForFiles,
  loadMemoryMarkdown,
  parseMemorySections,
} from '../lib/memoryParser'

interface DataAnalysisProps {
  panes: AnalysisPaneSnapshot[]
}

export function DataAnalysis({ panes }: DataAnalysisProps) {
  const { reportError, clearSource } = useErrors()
  const [sections, setSections] = useState(parseMemorySections(''))
  const [analysisParameters, setAnalysisParameters] = useState('')
  const [resultsMarkdown, setResultsMarkdown] = useState('')
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [runningAnalysis, setRunningAnalysis] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const activeFilenames = useMemo(
    () => panes.map((pane) => pane.filename).filter((filename): filename is string => Boolean(filename)),
    [panes],
  )

  const refreshMemory = useCallback(async () => {
    setLoadingMemory(true)
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
      setLoadingMemory(false)
    }
  }, [reportError, clearSource])

  useEffect(() => {
    void refreshMemory()
  }, [refreshMemory])

  const handleCheckPrevious = () => {
    const matches = getSectionsForFiles(sections, activeFilenames)
    if (matches.length === 0) {
      setResultsMarkdown('')
      setStatusMessage('No previous analysis found for the selected curve(s).')
      return
    }
    setStatusMessage(null)
    setResultsMarkdown(matches.map((section) => section.content).join('\n\n---\n\n'))
  }

  const handleRunAnalysis = async () => {
    const activePanes = panes.filter((pane) => pane.filename && pane.series && pane.metrics)
    if (activePanes.length === 0) {
      reportError('Analysis', 'Load at least one CSV curve before running analysis.')
      return
    }

    setRunningAnalysis(true)
    setStatusMessage(null)
    clearSource('Analysis')

    try {
      const filenames = activePanes.map((pane) => pane.filename!).filter(Boolean)
      const priorSections = getSectionsForFiles(sections, filenames)
      const prompt = buildAnalysisPrompt(panes, analysisParameters, priorSections)
      const sectionKey =
        filenames.length > 1 ? compositeMemoryKey(filenames) : filenames[0] ?? 'unknown'

      const response = await runAnalysisRequest({ prompt, sectionKey })
      setResultsMarkdown(response.results)

      if (response.persisted) {
        await refreshMemory()
        setStatusMessage(null)
      } else {
        setStatusMessage(
          'Analysis complete. Memory was not persisted to the repo (configure GITHUB_PAT on the analysis worker).',
        )
      }
    } catch (err) {
      reportError('Analysis', err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setRunningAnalysis(false)
    }
  }

  return (
    <section className="analysis-panel panel">
      <h2 className="section-title">Data Analysis</h2>

      <label className="analysis-field">
        <span>Analysis Parameters</span>
        <textarea
          className="analysis-parameters"
          value={analysisParameters}
          onChange={(event) => setAnalysisParameters(event.target.value)}
          placeholder="Add questions, context, or comparison notes for the AI prompt..."
          rows={3}
        />
      </label>

      <div className="analysis-actions">
        <button
          type="button"
          className="action-button"
          onClick={() => void handleRunAnalysis()}
          disabled={runningAnalysis}
        >
          {runningAnalysis ? 'Running AI Analysis...' : 'Run AI Analysis'}
        </button>
        <button
          type="button"
          className="action-button"
          onClick={handleCheckPrevious}
          disabled={loadingMemory}
        >
          Check for Previous Analysis
        </button>
      </div>

      {statusMessage ? <p className="status-text">{statusMessage}</p> : null}

      <div className="analysis-results">
        <h3 className="analysis-results-title">Results</h3>
        {resultsMarkdown ? (
          <div className="analysis-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultsMarkdown}</ReactMarkdown>
          </div>
        ) : (
          <p className="analysis-empty">
            Run AI Analysis or check previous memory for{' '}
            {activeFilenames.length > 0 ? activeFilenames.join(', ') : 'the selected curve(s)'}.
          </p>
        )}
      </div>
    </section>
  )
}
