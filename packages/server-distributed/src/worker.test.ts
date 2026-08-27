import { describe, expect, it } from 'vitest'
import { jsonStrategies } from '@collabhub/domain-json'
import type { CanonicalEvent, CollaborationOperation, JsonObject, OperationResult, SnapshotMessage } from '@collabhub/protocol'
import { defineDomainPack } from '@collabhub/strategy-sdk'
import { operationFingerprint } from './identity.js'
import type {
  CommitOutcome,
  CommitRequest,
  CommitStore,
  InternalRoomEvent,
  LoadedRoom,
  OwnerRecord,
  OwnershipCoordinator,
  RoomIdentity,
  StoredReceipt,
} from './types.js'
import { DistributedRoomWorker } from './worker.js'

class MemoryCommitStore implements CommitStore<JsonObject> {
  version = 0
  readonly wal: LoadedRoom['wal'] = []
  readonly receipts = new Map<string, StoredReceipt>()
  readonly snapshots: Array<{ room: RoomIdentity; version: number; schemaVersion: string; state: JsonObject }> = []
  async migrate() {}
  async ensureDocument() {}
  async claimOwnership() { return 1 }
  async loadRoom(room: RoomIdentity): Promise<LoadedRoom<JsonObject>> {
    return {
      ...room, schemaVersion: '1.0', version: this.version, ownerEpoch: 1, ownerInstanceId: 'worker',
      snapshotVersion: 0, state: { title: 'Initial' }, wal: this.wal,
    }
  }
  async lookupReceipt(_room: RoomIdentity, operationId: string) { return this.receipts.get(operationId) }
  async recordReceipt(_room: RoomIdentity, _owner: { epoch: number; instanceId: string }, fingerprint: string, result: OperationResult) {
    if (this.receipts.has(result.operationId)) return 'exists' as const
    this.receipts.set(result.operationId, { fingerprint, result })
    return 'stored' as const
  }
  async commit(request: CommitRequest): Promise<CommitOutcome> {
    if (request.resolvedAtVersion !== this.version) return { kind: 'versionConflict', canonicalVersion: this.version }
    const canonicalVersion = ++this.version
    const result: Extract<OperationResult, { kind: 'accepted' }> = {
      kind: 'accepted', operationId: request.operation.operationId, canonicalVersion, patches: request.patches,
    }
    const event: CanonicalEvent = {
      kind: 'canonical', operationId: request.operation.operationId, actorId: request.operation.actorId,
      canonicalVersion, patches: request.patches,
    }
    this.wal.push({ ...request, version: canonicalVersion, committedAt: new Date().toISOString() })
    this.receipts.set(request.operation.operationId, { fingerprint: request.fingerprint, result })
    return { kind: 'committed', result, event }
  }
  async saveSnapshot(room: RoomIdentity, version: number, schemaVersion: string, state: JsonObject) {
    this.snapshots.push({ room, version, schemaVersion, state })
  }
  async snapshot(room: RoomIdentity): Promise<SnapshotMessage<JsonObject>> {
    return { kind: 'snapshot', ...room, canonicalVersion: this.version, schemaVersion: '1.0', snapshotRef: 'memory://snapshot', snapshot: { title: 'Initial' } }
  }
  async eventsAfter() { return [] }
  async headVersion() { return this.version }
  async claimOutbox(): Promise<Array<{ id: string; event: InternalRoomEvent }>> { return [] }
  async markOutboxDelivered() {}
  async ping() {}
  async close() {}
}

class MemoryCoordinator implements OwnershipCoordinator {
  readonly released: RoomIdentity[] = []
  async start() {}
  async registerWorker() { return async () => undefined }
  async listWorkers() { return [] }
  async owner(): Promise<OwnerRecord | undefined> { return undefined }
  async publishOwner() {}
  async renewOwner() { return true }
  async releaseOwner(room: RoomIdentity) { this.released.push(room) }
  async publishEvent() {}
  async publishPresence() {}
  async subscribe() { return async () => undefined }
  async ping() {}
  async close() {}
}

function operation(operationId: string, value: string, baseVersion = 0): CollaborationOperation {
  return {
    tenantId: 't', documentId: 'd', actorId: operationId, clientId: operationId, operationId,
    baseVersion, schemaVersion: '1.0', operationType: 'property.set',
    strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value },
  }
}

describe('distributed worker semantic parity', () => {
  it('uses the shared pipeline and the Domain Pack stale-operation policy', async () => {
    const domainPack = defineDomainPack<JsonObject>({
      id: 'test.distributed', schemaVersion: '1.0', strategies: jsonStrategies,
      operationVersionPolicy: { decide: () => ({ kind: 'resolve' }) },
      initialState: () => ({ title: 'Initial' }),
    })
    const store = new MemoryCommitStore()
    const worker = new DistributedRoomWorker({
      instanceId: 'worker', internalUrl: 'http://worker', port: 0, internalToken: 'test',
      store, coordinator: new MemoryCoordinator(), domainPack, maxRecoveryGap: 0,
    })
    const context = { tenantId: 't', documentId: 'd', actorId: 'alice', clientId: 'alice' }
    const first = operation('first', 'One')
    const second = { ...operation('second', 'Two'), actorId: 'alice', clientId: 'alice' }
    expect(operationFingerprint(first)).not.toBe(operationFingerprint(second))
    expect((await worker.submit({ ...context, actorId: first.actorId, clientId: first.clientId }, first)).kind).toBe('accepted')
    expect((await worker.submit(context, second)).kind).toBe('accepted')
    expect(store.version).toBe(2)
  })

  it('uses the shared TTL policy, snapshots cold state, and releases ownership before eviction', async () => {
    let now = 0
    const domainPack = defineDomainPack<JsonObject>({
      id: 'test.distributed-cache', schemaVersion: '1.0', strategies: jsonStrategies,
      initialState: () => ({ title: 'Initial' }),
    })
    const store = new MemoryCommitStore()
    const coordinator = new MemoryCoordinator()
    const worker = new DistributedRoomWorker({
      instanceId: 'worker', internalUrl: 'http://worker', port: 0, internalToken: 'test',
      store, coordinator, domainPack,
      roomCachePolicy: { idleTtlMs: 100, maxWarmRooms: 10, scanIntervalMs: 60_000 },
      clock: () => now,
    })
    await worker.activate({ tenantId: 't', documentId: 'cold' })
    now = 101
    const result = await worker.sweepRooms()

    expect(result.evicted).toEqual([{ key: 't\u0000cold', reason: 'idle' }])
    expect(worker.warmRoomCount).toBe(0)
    expect(store.snapshots).toEqual([expect.objectContaining({ room: { tenantId: 't', documentId: 'cold' }, version: 0 })])
    expect(coordinator.released).toEqual([{ tenantId: 't', documentId: 'cold' }])
  })

  it('applies the shared LRU cap while retaining PostgreSQL-equivalent cold data', async () => {
    let now = 0
    const domainPack = defineDomainPack<JsonObject>({
      id: 'test.distributed-lru', schemaVersion: '1.0', strategies: jsonStrategies,
      initialState: () => ({ title: 'Initial' }),
    })
    const store = new MemoryCommitStore()
    const coordinator = new MemoryCoordinator()
    const worker = new DistributedRoomWorker({
      instanceId: 'worker', internalUrl: 'http://worker', port: 0, internalToken: 'test',
      store, coordinator, domainPack,
      roomCachePolicy: { idleTtlMs: 10_000, maxWarmRooms: 1, scanIntervalMs: 60_000 },
      clock: () => now,
    })
    await worker.activate({ tenantId: 't', documentId: 'oldest' })
    now = 1
    await worker.activate({ tenantId: 't', documentId: 'newest' })

    expect(worker.warmRoomCount).toBe(1)
    expect(store.snapshots[0]).toMatchObject({ room: { tenantId: 't', documentId: 'oldest' } })
    expect(coordinator.released).toEqual([{ tenantId: 't', documentId: 'oldest' }])
  })
})
