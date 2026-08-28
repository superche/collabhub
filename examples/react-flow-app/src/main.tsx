import { createRoot } from 'react-dom/client'
import { createGraphApplication } from './app/composition-root.js'
import { GraphApp } from './components/graph-app.js'
import { LandingPage } from './landing-page.js'
import './styles.css'
import './landing.css'

const query = new URLSearchParams(location.search)
const isWorkspace = location.pathname === '/room'
  || query.has('document')
  || query.has('client')
  || query.get('embedded') === '1'

if (isWorkspace) {
  document.title = 'CollabHub x React Flow'
  const runtime = createGraphApplication()
  createRoot(document.getElementById('root')!).render(<GraphApp runtime={runtime} />)
} else {
  document.title = 'CollabHub · Multiplayer for existing React apps'
  createRoot(document.getElementById('root')!).render(<LandingPage />)
}
