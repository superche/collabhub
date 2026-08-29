import { createRoot } from 'react-dom/client'
import { createHybridApplication } from './app/composition-root.js'
import { HybridApp } from './components/hybrid-app.js'
import './styles.css'

const application = createHybridApplication()
createRoot(document.getElementById('root')!).render(
  <HybridApp application={application} />,
)
