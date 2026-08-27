import type { GraphCommand, GraphCommandResult, GraphDocument } from '../domain/graph-document.js'

export interface GraphRuntimeDiagnostics {
  connection: 'offline' | 'connecting' | 'online' | 'resyncing'
  pendingCount: number
  pendingBytes: number
  canonicalVersion: number
  reconnectCount: number
  resyncCount: number
  submittedOperations: number
  submittedMoves: number
  lastOperation?: string
  lastReject?: string
}

export interface GraphApplicationRuntime {
  readonly actorId: string
  getDocument(): GraphDocument
  execute(command: GraphCommand): Promise<GraphCommandResult>
  subscribeDocument(listener: () => void): () => void
  diagnostics(): Readonly<GraphRuntimeDiagnostics>
  subscribeDiagnostics(listener: () => void): () => void
  setNetworkAvailable(available: boolean): void
  close(): void
}
