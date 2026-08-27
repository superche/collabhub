import { createRoot } from 'react-dom/client'
import { createGraphApplication } from './app/composition-root.js'
import { GraphApp } from './components/graph-app.js'
import './styles.css'

const runtime = createGraphApplication()
createRoot(document.getElementById('root')!).render(<GraphApp runtime={runtime} />)
