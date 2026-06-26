import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ErrorSource = 'Manifest' | 'CSV' | 'Graph' | 'Analysis' | 'Metrics' | 'System'

export interface AppError {
  id: string
  source: ErrorSource
  message: string
  timestamp: string
}

interface ErrorContextValue {
  errors: AppError[]
  reportError: (source: ErrorSource, message: string) => void
  clearError: (id: string) => void
  clearSource: (source: ErrorSource) => void
  clearAll: () => void
}

const ErrorContext = createContext<ErrorContextValue | null>(null)

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<AppError[]>([])

  const reportError = useCallback((source: ErrorSource, message: string) => {
    const entry: AppError = {
      id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source,
      message,
      timestamp: new Date().toISOString(),
    }
    setErrors((current) => [entry, ...current].slice(0, 20))
  }, [])

  const clearError = useCallback((id: string) => {
    setErrors((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const clearSource = useCallback((source: ErrorSource) => {
    setErrors((current) => current.filter((entry) => entry.source !== source))
  }, [])

  const clearAll = useCallback(() => {
    setErrors([])
  }, [])

  const value = useMemo(
    () => ({ errors, reportError, clearError, clearSource, clearAll }),
    [errors, reportError, clearError, clearSource, clearAll],
  )

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>
}

export function useErrors(): ErrorContextValue {
  const context = useContext(ErrorContext)
  if (!context) {
    throw new Error('useErrors must be used within ErrorProvider')
  }
  return context
}
