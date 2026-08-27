import type { JsonObject } from '@collabhub/protocol';
import type { StorageAdapter, StoredSnapshot, WalRecord } from '@collabhub/server-core';
import type { DraftRepository } from './draft-repository.js';
export declare class DraftRepositoryStorageAdapter implements StorageAdapter<JsonObject> {
    private readonly repository;
    constructor(repository: DraftRepository);
    loadSnapshot(tenantId: string, documentId: string): Promise<StoredSnapshot<JsonObject>>;
    loadWal(_tenantId: string, documentId: string, afterVersion: number): Promise<WalRecord[]>;
    appendWal(record: WalRecord): Promise<void>;
    saveSnapshot(snapshot: StoredSnapshot<JsonObject>): Promise<void>;
}
//# sourceMappingURL=draft-storage-adapter.d.ts.map