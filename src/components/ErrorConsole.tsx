import { useErrors } from '../lib/errors'

export function ErrorConsole() {
  const { errors, clearError, clearAll } = useErrors()

  if (errors.length === 0) {
    return (
      <section className="error-console panel" aria-label="System error console">
        <div className="error-console-header">
          <h2 className="error-console-title">System Status</h2>
          <span className="error-console-ok">ALL SYSTEMS NOMINAL</span>
        </div>
      </section>
    )
  }

  return (
    <section className="error-console panel error-console-active" aria-label="System error console">
      <div className="error-console-header">
        <h2 className="error-console-title">System Errors</h2>
        <button type="button" className="action-button" onClick={clearAll}>
          Clear All
        </button>
      </div>
      <ul className="error-console-list">
        {errors.map((entry, index) => (
          <li key={entry.id} className={index === 0 ? 'error-entry error-entry-latest' : 'error-entry'}>
            <div className="error-entry-meta">
              <span className="error-source">[{entry.source}]</span>
              <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</time>
              <button type="button" className="error-dismiss" onClick={() => clearError(entry.id)}>
                ×
              </button>
            </div>
            <p className="error-entry-message">{entry.message}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
