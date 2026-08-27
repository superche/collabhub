export class RestDraftTransport {
    baseUrl;
    draftId;
    listeners = new Set();
    constructor(baseUrl, draftId) {
        this.baseUrl = baseUrl;
        this.draftId = draftId;
        void this.refresh();
    }
    async execute(command) {
        const response = await fetch(`${this.baseUrl}/api/drafts/${this.draftId}/commands`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
        });
        const body = await response.json();
        if (body.draft)
            this.publish({ type: 'draft.changed', draft: body.draft });
        return { ok: response.ok, revision: body.draft?.revision ?? body.revision ?? 0, reason: body.reason };
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    getConnectionState() { return 'online'; }
    close() { this.listeners.clear(); }
    async refresh() {
        const response = await fetch(`${this.baseUrl}/api/drafts/${this.draftId}`);
        if (!response.ok)
            throw new Error('unable to load draft');
        this.publish({ type: 'draft.replaced', draft: await response.json() });
    }
    publish(event) { for (const listener of this.listeners)
        listener(event); }
}
//# sourceMappingURL=rest-draft-transport.js.map