import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { createCollabRuntime } from './collab/collabhub-runtime.js'
import './styles.css'

const actorId = new URLSearchParams(location.search).get('client') ?? crypto.randomUUID().slice(0, 8)
const runtime = createCollabRuntime({ actorId, documentId: 'welcome' })

createRoot(document.getElementById('root')!).render(
  <StrictMode><App runtime={runtime} actorId={actorId} /></StrictMode>,
)
