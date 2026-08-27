import type { Block, PartialBlock } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { useEffect, useRef, useState } from 'react'
import { jsonFingerprint } from '../application/json-fingerprint.js'
import type { BlockNoteApplicationRuntime } from '../application/runtime.js'

export function BlockNoteApp({ runtime }: { runtime: BlockNoteApplicationRuntime }) {
  const editor = useCreateBlockNote({ initialContent: runtime.initialBlocks as PartialBlock[] })
  const applyingProjection = useRef(false)
  const projectedFingerprints = useRef(new Set<string>())
  const [, refreshDiagnostics] = useState(0)
  const diagnostics = runtime.diagnostics()

  useEffect(() => runtime.subscribeDiagnostics(() => refreshDiagnostics((value) => value + 1)), [runtime])
  useEffect(() => runtime.subscribeBlocks((blocks) => {
    if (jsonFingerprint(editor.document) === jsonFingerprint(blocks)) return
    applyingProjection.current = true
    try {
      editor.replaceBlocks(editor.document, blocks as PartialBlock[])
      const fingerprint = jsonFingerprint(editor.document)
      projectedFingerprints.current.add(fingerprint)
      window.setTimeout(() => projectedFingerprints.current.delete(fingerprint), 1_000)
    }
    finally { applyingProjection.current = false }
  }), [editor, runtime])
  useEffect(() => () => runtime.close(), [runtime])

  const appendParagraph = () => {
    const last = editor.document.at(-1)
    if (last) editor.insertBlocks([{ type: 'paragraph', content: `New block from ${runtime.actorId}` }], last, 'after')
  }
  const moveLastFirst = () => {
    const last = editor.document.at(-1)
    if (!last) return
    for (let index = 1; index < editor.document.length; index++) editor.moveBlocksUp(last)
  }

  return <main>
    <header>
      <div>
        <span className="eyebrow">COLLABHUB EXAMPLE</span>
        <h1>BlockNote adapter</h1>
        <p>BlockNote stays the editor. CollabHub owns ordering, recovery, and canonical patches.</p>
      </div>
      <div className="actor"><span>Client</span><strong>{runtime.actorId}</strong></div>
    </header>
    <section className="layout">
      <article className="editor-card">
        <div className="editor-toolbar">
          <span>Collaborative document</span>
          <div>
            <button data-testid="append-block" onClick={appendParagraph}>Append block</button>
            <button data-testid="move-last-first" className="secondary" onClick={moveLastFirst}>Move last first</button>
          </div>
        </div>
        <div data-testid="blocknote-editor">
          <BlockNoteView
            editor={editor}
            theme="light"
            onChange={(changedEditor, context) => {
              if (applyingProjection.current) return
              const fingerprint = jsonFingerprint(changedEditor.document)
              if (projectedFingerprints.current.has(fingerprint)) return
              runtime.handleEditorChange(
                  changedEditor.document as Block[],
                  context.getChanges().map((change) => ({ type: change.type, blockId: change.block.id })),
                )
            }}
          />
        </div>
      </article>
      <aside className="diagnostics" data-testid="blocknote-diagnostics">
        <div className="diagnostics-heading"><h2>Collab trace</h2><span className={`status ${diagnostics.connection}`}>{diagnostics.connection}</span></div>
        <Metric label="Canonical version" value={diagnostics.canonicalVersion} testId="blocknote-version" />
        <Metric label="Pending operations" value={diagnostics.pendingCount} testId="blocknote-pending" />
        <Metric label="Submitted operations" value={diagnostics.submittedOperations} testId="blocknote-submitted" />
        <Metric label="Updates / inserts" value={`${diagnostics.submittedByType['block.update'] ?? 0} / ${diagnostics.submittedByType['block.insert'] ?? 0}`} testId="blocknote-operation-counts" />
        <Metric label="Reconnects / resyncs" value={`${diagnostics.reconnectCount} / ${diagnostics.resyncCount}`} testId="blocknote-recovery" />
        <div className="trace"><span>Last operation</span><code data-testid="blocknote-last-operation">{diagnostics.lastOperation ?? 'none'}</code></div>
        <p>Typing is coalesced per block. The hot path carries one block operation, never the complete document. Presence and Yjs are not used.</p>
      </aside>
    </section>
  </main>
}

function Metric({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return <div className="metric"><span>{label}</span><strong data-testid={testId}>{value}</strong></div>
}
