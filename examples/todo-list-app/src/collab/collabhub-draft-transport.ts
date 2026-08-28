import { createCollaboration, type CollaborationStore, type ClientDiagnostics, type JsonObject } from '@collabhub/client-core'
import type { DraftCommandTransport } from '../application/draft-command-bus.js'
import type { DraftStore } from '../application/draft-store.js'
import type { DraftCommand, DraftCommandResult, DraftDocument, DraftDomainEvent } from '../domain/draft.js'
import { adaptDraftCommand } from './draft-command-adapter.js'
import { applyDraftPatches } from './draft-projection-adapter.js'

export class CollabHubDraftTransport implements DraftCommandTransport {
  private readonly collaboration: CollaborationStore<JsonObject, DraftCommand>
  private readonly listeners = new Set<(event: DraftDomainEvent) => void>()
  private diagnosticsValue: Readonly<ClientDiagnostics>
  private readonly onOffline = () => this.collaboration.setNetworkAvailable(false)
  private readonly onOnline = () => this.collaboration.setNetworkAvailable(true)

  constructor(url: string, actorId: string, clientId: string, store: DraftStore) {
    this.collaboration = createCollaboration<JsonObject, DraftCommand>({
      url, tenantId: 'demo', documentId: store.getSnapshot().id, actorId, clientId,
      initialState: store.getSnapshot() as unknown as JsonObject,
      command: (command, state) => {
        const adapted = adaptDraftCommand(command, state as unknown as DraftDocument)
        return {
          operation: {
            operationType: adapted.operationType,
            strategyId: adapted.strategyId,
            strategyVersion: adapted.strategyVersion,
            payload: adapted.payload,
            intent: adapted.intent,
          },
          optimisticPatches: adapted.optimisticPatches,
        }
      },
      applyPatches: (state, patches) => applyDraftPatches(state as unknown as DraftDocument, patches) as unknown as JsonObject,
      maxPendingOperations: 50, maxPendingBytes: 64_000, reconnectDelayMs: 250,
    })
    this.diagnosticsValue = this.collaboration.diagnostics
    this.collaboration.subscribe(() => {
      this.publish({ type: 'draft.changed', draft: this.collaboration.getSnapshot() as unknown as DraftDocument })
    })
    this.collaboration.subscribeDiagnostics((diagnostics) => { this.diagnosticsValue = diagnostics })
    window.addEventListener('offline', this.onOffline)
    window.addEventListener('online', this.onOnline)
  }

  async execute(command: DraftCommand): Promise<DraftCommandResult> {
    const result = await this.collaboration.execute(command)
    return { ok: result.kind === 'accepted', revision: result.canonicalVersion, reason: result.kind === 'rejected' ? result.reason.message : result.kind === 'resyncRequired' ? result.reason : undefined }
  }
  subscribe(listener: (event: DraftDomainEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getConnectionState() { return this.diagnosticsValue.connection }
  close() {
    window.removeEventListener('offline', this.onOffline)
    window.removeEventListener('online', this.onOnline)
    this.collaboration.close()
    this.listeners.clear()
  }
  diagnostics() { return this.diagnosticsValue }
  subscribeDiagnostics(listener: () => void) { return this.collaboration.subscribeDiagnostics(() => listener()) }
  sendPresence(data: Record<string, unknown>) { this.collaboration.sendPresence(data) }
  private publish(event: DraftDomainEvent) { for (const listener of this.listeners) listener(event) }
}
