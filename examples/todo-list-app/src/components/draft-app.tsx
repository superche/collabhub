import { memo, useEffect, useState, useSyncExternalStore } from 'react'
import type { DraftApplicationRuntime } from '../application/runtime.js'
import type { DraftCommand, DraftSection } from '../domain/draft.js'

export function DraftApp({ runtime }: { runtime: DraftApplicationRuntime }) {
  const draft = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot)
  const [, refreshDiagnostics] = useState(0)
  const diagnostics = runtime.diagnostics()
  const [collabEnabled, setCollabEnabled] = useState(diagnostics.mode === 'collab')
  const [error, setError] = useState<string>()
  useEffect(() => runtime.subscribeDiagnostics(() => refreshDiagnostics((value) => value + 1)), [runtime])

  const execute = async (command: DraftCommand) => {
    const result = await runtime.commandBus.execute(command)
    setError(result.ok ? undefined : result.reason ?? 'command rejected')
  }
  const addSection = () => void execute({ type: 'section.add', sectionId: crypto.randomUUID().slice(0, 8), heading: 'New task', after: draft.sections.at(-1)?.id })

  return <main>
    <header>
      <div><span className="eyebrow">COLLABHUB v0.1</span><h1>TODO List</h1></div>
      <label className="mode-switch"><input data-testid="collab-toggle" type="checkbox" checked={collabEnabled} onChange={(event) => { setCollabEnabled(event.target.checked); runtime.setCollaboration(event.target.checked) }} /> Collaborative transport</label>
    </header>
    <section className="layout">
      <article className="editor-card">
        <label className="field-label" htmlFor="title">List title</label>
        <input data-testid="draft-title" id="title" className="title-input" value={draft.title} onChange={(event) => runtime.store.publish({ type: 'draft.changed', draft: { ...draft, title: event.target.value } })} onBlur={(event) => void execute({ type: 'draft.rename', title: event.target.value })} />
        <div className="meta"><span>{draft.status}</span><span>revision {draft.revision}</span><span>{draft.sections.length} tasks</span></div>
        <div className="completion-card" data-testid="completion-summary">
          <div><strong>{draft.completion.completed}/{draft.completion.total} completed</strong><span data-testid="completion-percent">{draft.completion.percent}%</span></div>
          <div className="completion-track" aria-hidden="true"><span style={{ width: `${draft.completion.percent}%` }} /></div>
          <p>One task command updates the task and this aggregate in one canonical commit.</p>
        </div>
        <div className="sections" data-testid="sections">
          {draft.sections.map((section, index) => <SectionCard key={section.id} section={section} index={index} onCommand={execute} previousId={draft.sections[index - 1]?.id} />)}
        </div>
        <div className="actions"><button data-testid="add-section" onClick={addSection}>Add task</button><button className="secondary" onClick={() => void execute({ type: 'draft.submitReview', expectedRevision: draft.revision })}>Submit list</button></div>
        {error && <p className="error" data-testid="command-error">{error}</p>}
      </article>
      <aside className="diagnostics" data-testid="diagnostics">
        <div className="diagnostics-heading"><h2>Live diagnostics</h2><span className={`status ${diagnostics.connection}`}>{diagnostics.connection}</span></div>
        <Metric label="Transport" value={diagnostics.mode.toUpperCase()} />
        <Metric label="Canonical version" value={diagnostics.canonicalVersion} testId="canonical-version" />
        <Metric label="Pending ops" value={`${diagnostics.pendingCount} · ${diagnostics.pendingBytes} B`} testId="pending-count" />
        <Metric label="Ack latency" value={diagnostics.lastAckLatencyMs === undefined ? '—' : `${diagnostics.lastAckLatencyMs} ms`} />
        <Metric label="Reconnects / resyncs" value={`${diagnostics.reconnectCount} / ${diagnostics.resyncCount}`} testId="recovery-counts" />
        <div className="trace"><span>Last reject</span><code data-testid="last-reject">{diagnostics.lastReject ?? 'none'}</code></div>
        <p className="lane-note">Presence uses the ephemeral WebSocket lane. Edits use versioned incremental operations; snapshots are recovery-only.</p>
      </aside>
    </section>
  </main>
}

const SectionCard = memo(function SectionCard({ section, index, previousId, onCommand }: { section: DraftSection; index: number; previousId?: string; onCommand(command: DraftCommand): Promise<void> }) {
  const [heading, setHeading] = useState(section.heading)
  const [body, setBody] = useState(section.body)
  useEffect(() => setHeading(section.heading), [section.heading])
  useEffect(() => setBody(section.body), [section.body])
  return <section className={`section-card${section.completed ? ' completed' : ''}`} data-section-id={section.id}>
    <label className="task-check"><input data-testid={`complete-${section.id}`} aria-label={`Complete ${section.id}`} type="checkbox" checked={section.completed} onChange={(event) => void onCommand({ type: 'section.setCompleted', sectionId: section.id, completed: event.target.checked })} /><span>{String(index + 1).padStart(2, '0')}</span></label>
    <div className="section-content">
      <input aria-label={`Heading ${section.id}`} value={heading} onChange={(event) => setHeading(event.target.value)} onBlur={() => void onCommand({ type: 'section.update', sectionId: section.id, patch: { heading } })} />
      <textarea aria-label={`Body ${section.id}`} value={body} onChange={(event) => setBody(event.target.value)} onBlur={() => void onCommand({ type: 'section.update', sectionId: section.id, patch: { body } })} />
    </div>
    <div className="section-tools"><button aria-label={`Move ${section.id} first`} onClick={() => void onCommand({ type: 'section.move', sectionId: section.id })}>↑</button><button aria-label={`Delete ${section.id}`} onClick={() => void onCommand({ type: 'section.delete', sectionId: section.id })}>×</button></div>
  </section>
})

function Metric({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return <div className="metric"><span>{label}</span><strong data-testid={testId}>{value}</strong></div>
}
