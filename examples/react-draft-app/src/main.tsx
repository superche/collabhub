import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createDraftApplication } from './app/composition-root.js'
import { DraftApp } from './components/draft-app.js'
import './styles.css'

const runtime = createDraftApplication()
createRoot(document.getElementById('root')!).render(<StrictMode><DraftApp runtime={runtime} /></StrictMode>)
