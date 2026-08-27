import type { GraphApplicationRuntime, GraphRuntimeDiagnostics } from '../application/runtime.js'
import type { GraphCommand } from '../domain/graph-document.js'
import { CollabHubGraphTransport } from './collabhub-graph-transport.js'

export class ReactFlowCollaborationRuntime implements GraphApplicationRuntime {
  private readonly diagnosticListeners = new Set<() => void>()
  private submittedOperations = 0
  private submittedMoves = 0
  private lastOperation?: string
  private readonly unsubscribeDiagnostics: () => void

  constructor(readonly actorId: string, private readonly transport: CollabHubGraphTransport) {
    this.unsubscribeDiagnostics = transport.subscribeDiagnostics(() => this.publishDiagnostics())
  }

  getDocument() { return this.transport.document }
  subscribeDocument(listener: () => void) { return this.transport.subscribeDocument(listener) }
  async execute(command: GraphCommand) {
    this.submittedOperations += 1
    if (command.type === 'node.move') this.submittedMoves += 1
    this.lastOperation = command.type
    this.publishDiagnostics()
    const result = await this.transport.execute(command)
    if (!result.ok) this.lastOperation = `${command.type} rejected: ${result.reason ?? 'unknown'}`
    this.publishDiagnostics()
    return result
  }
  diagnostics(): Readonly<GraphRuntimeDiagnostics> {
    const value = this.transport.diagnostics
    return {
      connection: value.connection, pendingCount: value.pendingCount, pendingBytes: value.pendingBytes,
      canonicalVersion: value.canonicalVersion, reconnectCount: value.reconnectCount, resyncCount: value.resyncCount,
      submittedOperations: this.submittedOperations, submittedMoves: this.submittedMoves, lastOperation: this.lastOperation,
      lastReject: value.lastReject ? `${value.lastReject.code}: ${value.lastReject.message}` : undefined,
    }
  }
  subscribeDiagnostics(listener: () => void) { this.diagnosticListeners.add(listener); listener(); return () => this.diagnosticListeners.delete(listener) }
  setNetworkAvailable(available: boolean) { this.transport.setNetworkAvailable(available) }
  close() { this.unsubscribeDiagnostics(); this.transport.close(); this.diagnosticListeners.clear() }
  private publishDiagnostics() { for (const listener of this.diagnosticListeners) listener() }
}
