import { CollaborationClient } from '@collabhub/client-core';
import { adaptDraftCommand } from './draft-command-adapter.js';
import { applyDraftPatches } from './draft-projection-adapter.js';
export class CollabHubDraftTransport {
    store;
    client;
    listeners = new Set();
    diagnosticsValue;
    onOffline = () => this.client.setNetworkAvailable(false);
    onOnline = () => this.client.setNetworkAvailable(true);
    constructor(url, actorId, clientId, store) {
        this.store = store;
        this.client = new CollaborationClient({
            url, tenantId: 'demo', documentId: store.getSnapshot().id, actorId, clientId, schemaVersion: '1.0',
            applyPatches: (state, patches) => applyDraftPatches(state, patches),
            maxPendingOperations: 50, maxPendingBytes: 64_000, reconnectDelayMs: 250,
        });
        this.diagnosticsValue = this.client.diagnostics;
        this.client.subscribe((state) => {
            const draft = { ...state, revision: this.client.canonicalVersion };
            this.publish({ type: 'draft.changed', draft });
        });
        this.client.subscribeDiagnostics((diagnostics) => { this.diagnosticsValue = diagnostics; });
        window.addEventListener('offline', this.onOffline);
        window.addEventListener('online', this.onOnline);
        this.client.connect();
    }
    async execute(command) {
        const adapted = adaptDraftCommand(command, this.store.getSnapshot());
        const result = await this.client.submit(adapted, adapted.optimisticPatches);
        return { ok: result.kind === 'accepted', revision: result.canonicalVersion, reason: result.kind === 'rejected' ? result.reason.message : result.kind === 'resyncRequired' ? result.reason : undefined };
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    getConnectionState() { return this.diagnosticsValue.connection; }
    close() {
        window.removeEventListener('offline', this.onOffline);
        window.removeEventListener('online', this.onOnline);
        this.client.disconnect();
        this.listeners.clear();
    }
    diagnostics() { return this.diagnosticsValue; }
    subscribeDiagnostics(listener) { return this.client.subscribeDiagnostics(() => listener()); }
    sendPresence(data) { this.client.sendPresence(data); }
    publish(event) { for (const listener of this.listeners)
        listener(event); }
}
//# sourceMappingURL=collabhub-draft-transport.js.map