import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorProvider } from './lib/errors'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorProvider>
      <App />
    </ErrorProvider>
  </StrictMode>,
)
