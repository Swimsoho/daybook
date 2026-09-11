import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import SharedTaskPage from './pages/SharedTaskPage'
import SharedProjectPage from './pages/SharedProjectPage'
import { UpdatePrompt } from './components/UpdatePrompt'
import { ErrorBoundary } from './components/ErrorBoundary'

// A "share this task" link (task detail > Share) points recipients at /share/:token — a public,
// no-login page. Checked here, before App/StoreProvider/CloudProvider/AuthGate ever mount,
// since whoever opens that link has no Daybook account at all and should never hit the sign-in
// screen. Every other path renders the normal authenticated app, unchanged.
const projectShareMatch = window.location.pathname.match(/^\/share\/project\/([^/]+)\/?$/)
const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {projectShareMatch
        ? <SharedProjectPage token={projectShareMatch[1]} />
        : shareMatch ? <SharedTaskPage token={shareMatch[1]} /> : <App />}
      {/* Sits above everything and appears only when a newer version has been deployed. */}
      <UpdatePrompt />
    </ErrorBoundary>
  </StrictMode>,
)
