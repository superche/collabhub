export class DraftRepositoryStorageAdapter {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async loadSnapshot(tenantId, documentId) {
        const draft = await this.repository.get(documentId);
        return {
            tenantId, documentId, version: draft.revision, schemaVersion: '1.0',
            state: draft,
            snapshotRef: `draft-repository://${encodeURIComponent(documentId)}/${draft.revision}`,
        };
    }
    async loadWal(_tenantId, documentId, afterVersion) {
        return this.repository.wal(documentId, afterVersion);
    }
    async appendWal(record) {
        await this.repository.appendCanonical(record.documentId, record);
    }
    async saveSnapshot(snapshot) {
        const draft = { ...snapshot.state, revision: snapshot.version };
        await this.repository.replace(snapshot.documentId, draft);
    }
}
//# sourceMappingURL=draft-storage-adapter.js.map