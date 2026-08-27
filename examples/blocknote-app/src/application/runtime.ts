import type { Block } from '@blocknote/core'

export interface BlockNoteRuntimeDiagnostics {
  connection: 'offline' | 'connecting' | 'online' | 'resyncing'
  pendingCount: number
  pendingBytes: number
  canonicalVersion: number
  reconnectCount: number
  resyncCount: number
  lastReject?: { operationId: string; code: string; message: string }
  lastAckLatencyMs?: number
  submittedOperations: number
  submittedByType: Readonly<Record<string, number>>
  lastOperation?: string
}

export interface BlockChangeHint {
  type: 'insert' | 'update' | 'delete' | 'move'
  blockId: string
}

export interface BlockNoteApplicationRuntime {
  readonly actorId: string
  readonly initialBlocks: Block[]
  handleEditorChange(blocks: readonly Block[], changes?: readonly BlockChangeHint[]): void
  subscribeBlocks(listener: (blocks: readonly Block[]) => void): () => void
  diagnostics(): Readonly<BlockNoteRuntimeDiagnostics>
  subscribeDiagnostics(listener: () => void): () => void
  close(): void
}
