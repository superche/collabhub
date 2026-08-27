import { createRoot } from 'react-dom/client'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { createBlockNoteApplication } from './app/composition-root.js'
import { BlockNoteApp } from './components/blocknote-app.js'
import './styles.css'

const runtime = createBlockNoteApplication()
createRoot(document.getElementById('root')!).render(<BlockNoteApp runtime={runtime} />)
