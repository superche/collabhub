import type { JsonObject } from '@collabhub/protocol'
import type { StorageAdapter, StoredSnapshot, WalRecord } from '@collabhub/server-core'
import type { DraftDocument } from '../src/domain/draft.js'
import type { DraftRepository } from './draft-repository.js'

export class DraftRepositoryStorageAdapter implements StorageAdapter<JsonObject> {
  constructor(private readonly repository: DraftRepository) {}
  async loadSnapshot(tenantId: string, documentId: string): Promise<StoredSnapshot<JsonObject>> {
    const draft = await this.repository.get(documentId)
    return {
      tenantId, documentId, version: draft.revision, schemaVersion: '1.0',
      state: draft as unknown as JsonObject,
      snapshotRef: `draft-repository://${encodeURIComponent(documentId)}/${draft.revision}`,
    }
  }
  async loadWal(_tenantId: string, documentId: string, afterVersion: number) {
    return this.repository.wal(documentId, afterVersion) as Promise<WalRecord[]>
  }
  async appendWal(record: WalRecord) {
    await this.repository.appendCanonical(record.documentId, record)
  }
  async saveSnapshot(snapshot: StoredSnapshot<JsonObject>) {
    const draft = { ...(snapshot.state as unknown as DraftDocument), revision: snapshot.version }
    await this.repository.replace(snapshot.documentId, draft)
  }
}
