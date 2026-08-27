import { CollaborationClient, type ClientDiagnostics } from '@collabhub/client-core'
import type { JsonObject } from '@collabhub/protocol'
import type { BlockCommand, BlockCommandResult, BlockDocument } from '../domain/block-document.js'
import { initialBlockDocument } from '../domain/block-document.js'
import { adaptBlockCommand } from './block-command-adapter.js'
import { applyBlockPatches } from './block-projection-adapter.js'

export class CollabHubBlockTransport {
  private readonly client: CollaborationClient<JsonObject>
  private readonly documentListeners = new Set<(document: BlockDocument) => void>()
  private currentDocument: BlockDocument
  private diagnosticsValue: Readonly<ClientDiagnostics>
  private readonly onOffline = () => this.client.setNetworkAvailable(false)
  private readonly onOnline = () => this.client.setNetworkAvailable(true)

  constructor(url: string, documentId: string, actorId: string, clientId: string) {
    this.currentDocument = initialBlockDocument(documentId)
    this.client = new CollaborationClient<JsonObject>({
      url, tenantId: 'demo', documentId, actorId, clientId, schemaVersion: '1.0',
      applyPatches: (state, patches) => applyBlockPatches(state as unknown as BlockDocument, patches) as unknown as JsonObject,
      maxPendingOperations: 80, maxPendingBytes: 128_000, reconnectDelayMs: 250,
    })
    this.diagnosticsValue = this.client.diagnostics
    this.client.subscribe((state) => {
      this.currentDocument = state as unknown as BlockDocument
      for (const listener of this.documentListeners) listener(this.currentDocument)
    })
    this.client.subscribeDiagnostics((diagnostics) => { this.diagnosticsValue = diagnostics })
    window.addEventListener('offline', this.onOffline)
    window.addEventListener('online', this.onOnline)
    this.client.connect()
  }

  get document(): BlockDocument { return this.currentDocument }
  get diagnostics(): Readonly<ClientDiagnostics> { return this.diagnosticsValue }

  async execute(command: BlockCommand): Promise<BlockCommandResult> {
    const adapted = adaptBlockCommand(command, this.currentDocument)
    const result = await this.client.submit(adapted, adapted.optimisticPatches)
    return {
      ok: result.kind === 'accepted', canonicalVersion: result.canonicalVersion,
      reason: result.kind === 'rejected' ? result.reason.message : result.kind === 'resyncRequired' ? result.reason : undefined,
    }
  }

  subscribeDocument(listener: (document: BlockDocument) => void) {
    this.documentListeners.add(listener)
    listener(this.currentDocument)
    return () => this.documentListeners.delete(listener)
  }
  subscribeDiagnostics(listener: () => void) { return this.client.subscribeDiagnostics(() => listener()) }
  close() {
    window.removeEventListener('offline', this.onOffline)
    window.removeEventListener('online', this.onOnline)
    this.client.disconnect()
    this.documentListeners.clear()
  }
}
