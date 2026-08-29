import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { HybridApplication } from '../app/composition-root.js'

export function HybridApp({ application }: { application: HybridApplication }) {
  const metadata = useSyncExternalStore(application.metadata.subscribe, application.metadata.getSnapshot)
  const diagnostics = useSyncExternalStore(
    application.metadata.subscribeDiagnostics.bind(application.metadata),
    () => application.metadata.diagnostics,
  )
  const body = useSyncExternalStore(application.body.subscribe, application.body.getSnapshot)
  const yjsConnection = useSyncExternalStore(
    application.body.subscribeConnection,
    application.body.getConnectionSnapshot,
  )
  const shareUrl = useMemo(() => {
    const url = new URL(location.href)
    url.searchParams.delete('client')
    return url.toString()
  }, [])

  useEffect(() => () => {
    application.metadata.close()
    application.body.close()
  }, [application])

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">COLLABHUB EXAMPLE</p>
          <h1>CollabHub × Yjs</h1>
          <p className="lede">Business data stays in CollabHub. Character-level text stays in Yjs.</p>
        </div>
        <div className="identity"><span>CLIENT</span><strong>{application.actorId}</strong></div>
      </header>

      <section className="ownership" aria-label="Data ownership">
        <div><span className="dot collabhub" /> <strong>CollabHub owns</strong> title + workflow status</div>
        <div><span className="dot yjs" /> <strong>Yjs owns</strong> body text</div>
        <div className="rule">One field, one writer. Never mirror the body through both systems.</div>
      </section>

      <div className="workspace">
        <section className="editor-card">
          <label>
            <span>Document title <em>CollabHub</em></span>
            <input
              value={metadata.title}
              maxLength={120}
              onChange={event => void application.metadata.execute({ type: 'metadata.titleChanged', title: event.target.value })}
            />
          </label>
          <label>
            <span>Workflow <em>CollabHub</em></span>
            <select
              value={metadata.status}
              onChange={event => void application.metadata.execute({
                type: 'metadata.statusChanged',
                status: event.target.value as typeof metadata.status,
              })}
            >
              <option value="draft">Draft</option>
              <option value="review">In review</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="body-field">
            <span>Document body <em className="yjs-label">Yjs · character-level</em></span>
            <textarea
              value={body}
              placeholder="Open this URL in another browser and type here at the same time…"
              onChange={event => application.body.replace(event.target.value)}
            />
          </label>
        </section>

        <aside>
          <h2>Live diagnostics</h2>
          <Metric label="CollabHub" value={diagnostics.connection} />
          <Metric label="Document version" value={String(diagnostics.canonicalVersion)} />
          <Metric label="Pending commands" value={String(diagnostics.pendingCount)} />
          <Metric label="Yjs" value={yjsConnection.replace(':', ' · ')} />
          <Metric label="Body characters" value={String(body.length)} />
          <a href={shareUrl}>Open the same room ↗</a>
        </aside>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}
