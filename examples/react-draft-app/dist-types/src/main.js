import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDraftApplication } from './app/composition-root.js';
import { DraftApp } from './components/draft-app.js';
import './styles.css';
const runtime = createDraftApplication();
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(DraftApp, { runtime: runtime }) }));
//# sourceMappingURL=main.js.map