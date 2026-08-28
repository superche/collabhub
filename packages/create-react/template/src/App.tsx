import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AppRuntime } from './application.js'

export function App({ runtime, actorId }: { runtime: AppRuntime; actorId: string }) {
  const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const diagnostics = useSyncExternalStore(runtime.subscribeDiagnostics, runtime.getDiagnostics)
  const [title, setTitle] = useState(document.title)
  useEffect(() => setTitle(document.title), [document.title])

  return <main>
    <span>COLLABHUB × REACT</span>
    <h1>Two clients. One document.</h1>
    <label>Shared title
      <input
        data-testid="shared-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => void runtime.execute({ type: 'document.rename', title })}
      />
    </label>
    <p data-testid="word-count">{document.wordCount} words · updated by the same command</p>
    <dl>
      <div><dt>Client</dt><dd>{actorId}</dd></div>
      <div><dt>Connection</dt><dd data-testid="connection">{diagnostics.connection}</dd></div>
      <div><dt>Canonical version</dt><dd data-testid="version">{diagnostics.canonicalVersion}</dd></div>
      <div><dt>Pending</dt><dd data-testid="pending">{diagnostics.pendingCount}</dd></div>
    </dl>
  </main>
}
