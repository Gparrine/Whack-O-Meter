import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAnalysisPrompt } from '../lib/analysisPrompt'
import type { AnalysisPaneSnapshot } from '../lib/graphPane'
import { callGemini } from '../lib/geminiClient'
import { persistMemoryMarkdown } from '../lib/githubMemory'
import { useErrors } from '../lib/errors'
import {
  compositeMemoryKey,
  getSectionsForFiles,
  loadMemoryMarkdown,
  mergeMemorySection,
  parseAnalysisResponse,
  parseMemorySections,
} from '../lib/memoryParser'

interface DataAnalysisProps {
  panes: AnalysisPaneSnapshot[]
}

const GEMINI_KEY_STORAGE = 'whack-o-meter-gemini-key'
const GITHUB_PAT_STORAGE = 'whack-o-meter-github-pat'

export function DataAnalysis({ panes }: DataAnalysisProps) {
  const { reportError, clearSource } = useErrors()
  const [sections, setSections] = useState(parseMemorySections(''))
  const [analysisParameters, setAnalysisParameters] = useState('')
  const [resultsMarkdown, setResultsMarkdown] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [githubPat, setGithubPat] = useState('')
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [runningAnalysis, setRunningAnalysis] = useState(false)
  const [memoryWarning, setMemoryWarning] = useState<string | null>(null)

  const activeFilenames = useMemo(
    () => panes.map((pane) => pane.filename).filter((filename): filename is string => Boolean(filename)),
    [panes],
  )

  useEffect(() => {
    setGeminiKey(sessionStorage.getItem(GEMINI_KEY_STORAGE) ?? '')
    setGithubPat(sessionStorage.getItem(GITHUB_PAT_STORAGE) ?? '')
  }, [])

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

  const handleGeminiKeyChange = (value: string) => {
    setGeminiKey(value)
    if (value) sessionStorage.setItem(GEMINI_KEY_STORAGE, value)
    else sessionStorage.removeItem(GEMINI_KEY_STORAGE)
  }

  const handleGithubPatChange = (value: string) => {
    setGithubPat(value)
    if (value) sessionStorage.setItem(GITHUB_PAT_STORAGE, value)
    else sessionStorage.removeItem(GITHUB_PAT_STORAGE)
  }

  const handleCheckPrevious = () => {
    const matches = getSectionsForFiles(sections, activeFilenames)
    if (matches.length === 0) {
      setResultsMarkdown('')
      setMemoryWarning('No previous analysis found for the selected curve(s).')
      return
    }
    setMemoryWarning(null)
    setResultsMarkdown(matches.map((section) => section.content).join('\n\n---\n\n'))
  }

  const handleRunAnalysis = async () => {
    if (!geminiKey.trim()) {
      reportError('Analysis', 'Enter a Gemini API key to run analysis.')
      return
    }

    const activePanes = panes.filter((pane) => pane.filename && pane.series && pane.metrics)
    if (activePanes.length === 0) {
      reportError('Analysis', 'Load at least one CSV curve before running analysis.')
      return
    }

    setRunningAnalysis(true)
    setMemoryWarning(null)
    clearSource('Analysis')

    try {
      const filenames = activePanes.map((pane) => pane.filename!).filter(Boolean)
      const priorSections = getSectionsForFiles(sections, filenames)
      const prompt = buildAnalysisPrompt(panes, analysisParameters, priorSections)
      const raw = await callGemini(geminiKey.trim(), prompt)
      const parsed = parseAnalysisResponse(raw)
      setResultsMarkdown(parsed.results)

      const sectionKey =
        filenames.length > 1 ? compositeMemoryKey(filenames) : filenames[0] ?? 'unknown'
      const currentMarkdown = sections.length
        ? `# Whack-O-Meter Analysis Memory\n\n> Auto-updated by AI analysis pipeline. Do not edit structure headers.\n\n${sections
            .map((section) => `## ${section.filename}\n${section.content}`)
            .join('\n\n')}`
        : ''
      const merged = mergeMemorySection(
        currentMarkdown || (await loadMemoryMarkdown().catch(() => '')),
        sectionKey,
        parsed.memory,
      )

      if (githubPat.trim()) {
        await persistMemoryMarkdown(githubPat.trim(), merged)
        setSections(parseMemorySections(merged))
        setMemoryWarning(null)
      } else {
        setMemoryWarning(
          'Analysis complete. Provide a GitHub PAT (session only) to persist memory to analysis/memory.md.',
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

      <div className="analysis-credentials">
        <label className="analysis-field">
          <span>Gemini API Key</span>
          <input
            type="password"
            className="search-input"
            value={geminiKey}
            onChange={(event) => handleGeminiKeyChange(event.target.value)}
            placeholder="Required for Run AI Analysis (session only)"
            autoComplete="off"
          />
        </label>
        <label className="analysis-field">
          <span>GitHub PAT (optional)</span>
          <input
            type="password"
            className="search-input"
            value={githubPat}
            onChange={(event) => handleGithubPatChange(event.target.value)}
            placeholder="Fine-grained token with Contents write access"
            autoComplete="off"
          />
        </label>
      </div>

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

      {memoryWarning ? <p className="status-text">{memoryWarning}</p> : null}

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
