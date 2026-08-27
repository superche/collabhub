import { CollaborationClient, type ClientDiagnostics } from '@collabhub/client-core'
import type { JsonObject } from '@collabhub/protocol'
import type { GraphCommand, GraphCommandResult, GraphDocument } from '../domain/graph-document.js'
import { initialGraphDocument } from '../domain/graph-document.js'
import { adaptGraphCommand } from './graph-command-adapter.js'
import { applyGraphPatches } from './graph-projection-adapter.js'

export class CollabHubGraphTransport {
  private readonly client: CollaborationClient<JsonObject>
  private readonly documentListeners = new Set<() => void>()
  private currentDocument: GraphDocument
  private diagnosticsValue: Readonly<ClientDiagnostics>

  constructor(url: string, documentId: string, actorId: string, clientId: string) {
    this.currentDocument = initialGraphDocument(documentId)
    this.client = new CollaborationClient<JsonObject>({
      url, tenantId: 'demo', documentId, actorId, clientId, schemaVersion: '1.0',
      applyPatches: (state, patches) => applyGraphPatches(state as unknown as GraphDocument, patches) as unknown as JsonObject,
      maxPendingOperations: 100, maxPendingBytes: 128_000, reconnectDelayMs: 250,
    })
    this.diagnosticsValue = this.client.diagnostics
    this.client.subscribe((state) => {
      this.currentDocument = state as unknown as GraphDocument
      for (const listener of this.documentListeners) listener()
    })
    this.client.subscribeDiagnostics((diagnostics) => { this.diagnosticsValue = diagnostics })
    this.client.connect()
  }

  get document(): GraphDocument { return this.currentDocument }
  get diagnostics(): Readonly<ClientDiagnostics> { return this.diagnosticsValue }

  async execute(command: GraphCommand): Promise<GraphCommandResult> {
    const adapted = adaptGraphCommand(command, this.currentDocument)
    const result = await this.client.submit(adapted, adapted.optimisticPatches)
    return {
      ok: result.kind === 'accepted', canonicalVersion: result.canonicalVersion,
      reason: result.kind === 'rejected' ? result.reason.message : result.kind === 'resyncRequired' ? result.reason : undefined,
    }
  }

  subscribeDocument(listener: () => void) {
    this.documentListeners.add(listener)
    listener()
    return () => this.documentListeners.delete(listener)
  }
  subscribeDiagnostics(listener: () => void) { return this.client.subscribeDiagnostics(() => listener()) }
  setNetworkAvailable(available: boolean) { this.client.setNetworkAvailable(available) }
  close() { this.client.disconnect(); this.documentListeners.clear() }
}
