import { CollaborationClient, type ClientDiagnostics } from '@collabhub/client-core'
import type { JsonObject } from '@collabhub/protocol'
import type { DraftCommandTransport } from '../application/draft-command-bus.js'
import type { DraftStore } from '../application/draft-store.js'
import type { DraftCommand, DraftCommandResult, DraftDocument, DraftDomainEvent } from '../domain/draft.js'
import { adaptDraftCommand } from './draft-command-adapter.js'
import { applyDraftPatches } from './draft-projection-adapter.js'

export class CollabHubDraftTransport implements DraftCommandTransport {
  private readonly client: CollaborationClient<JsonObject>
  private readonly listeners = new Set<(event: DraftDomainEvent) => void>()
  private diagnosticsValue: Readonly<ClientDiagnostics>
  private readonly onOffline = () => this.client.setNetworkAvailable(false)
  private readonly onOnline = () => this.client.setNetworkAvailable(true)

  constructor(url: string, actorId: string, clientId: string, private readonly store: DraftStore) {
    this.client = new CollaborationClient<JsonObject>({
      url, tenantId: 'demo', documentId: store.getSnapshot().id, actorId, clientId, schemaVersion: '1.0',
      applyPatches: (state, patches) => applyDraftPatches(state as unknown as DraftDocument, patches) as unknown as JsonObject,
      maxPendingOperations: 50, maxPendingBytes: 64_000, reconnectDelayMs: 250,
    })
    this.diagnosticsValue = this.client.diagnostics
    this.client.subscribe((state) => {
      this.publish({ type: 'draft.changed', draft: state as unknown as DraftDocument })
    })
    this.client.subscribeDiagnostics((diagnostics) => { this.diagnosticsValue = diagnostics })
    window.addEventListener('offline', this.onOffline)
    window.addEventListener('online', this.onOnline)
    this.client.connect()
  }

  async execute(command: DraftCommand): Promise<DraftCommandResult> {
    const adapted = adaptDraftCommand(command, this.store.getSnapshot())
    const result = await this.client.submit(adapted, adapted.optimisticPatches)
    return { ok: result.kind === 'accepted', revision: result.canonicalVersion, reason: result.kind === 'rejected' ? result.reason.message : result.kind === 'resyncRequired' ? result.reason : undefined }
  }
  subscribe(listener: (event: DraftDomainEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getConnectionState() { return this.diagnosticsValue.connection }
  close() {
    window.removeEventListener('offline', this.onOffline)
    window.removeEventListener('online', this.onOnline)
    this.client.disconnect()
    this.listeners.clear()
  }
  diagnostics() { return this.diagnosticsValue }
  subscribeDiagnostics(listener: () => void) { return this.client.subscribeDiagnostics(() => listener()) }
  sendPresence(data: Record<string, unknown>) { this.client.sendPresence(data) }
  private publish(event: DraftDomainEvent) { for (const listener of this.listeners) listener(event) }
}
