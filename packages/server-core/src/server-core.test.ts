import { describe, expect, it } from 'vitest'
import { jsonStrategies } from '@collabhub/domain-json'
import type { CollaborationOperation, JsonObject } from '@collabhub/protocol'
import { defineDomainPack, type ConflictStrategy } from '@collabhub/strategy-sdk'
import { AuthoritativeDocumentSession, CollaborationServerCore, InMemoryStorageAdapter } from './index.js'

const pack = defineDomainPack<JsonObject>({
  id: 'test.json', schemaVersion: '1.0', strategies: jsonStrategies,
  initialState: () => ({ title: 'Initial', status: 'draft', sections: [
    { id: 'a', heading: 'A', orderKey: '1024' },
    { id: 'b', heading: 'B', orderKey: '2048' },
    { id: 'c', heading: 'C', orderKey: '3072' },
  ] }),
})

function op(input: Partial<CollaborationOperation> & Pick<CollaborationOperation, 'operationId' | 'operationType' | 'strategyId' | 'payload'>): CollaborationOperation {
  return {
    tenantId: 't', documentId: 'd', actorId: input.operationId, clientId: input.operationId,
    baseVersion: 0, schemaVersion: '1.0', strategyVersion: '1.0', ...input,
  }
}

describe('authoritative document session', () => {
  it('orders concurrent property LWW operations and converges on the later server operation', async () => {
    const session = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage: new InMemoryStorageAdapter() })
    const first = op({ operationId: 'one', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Alice' } })
    const second = op({ operationId: 'two', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Bob' } })
    const [a, b] = await Promise.all([session.submit(first), session.submit(second)])
    expect(a.kind).toBe('accepted')
    expect(b.kind).toBe('accepted')
    expect(session.canonicalVersion).toBe(2)
    expect(session.canonicalState.title).toBe('Bob')
  })

  it('serializes concurrent section moves into a valid deterministic order', async () => {
    const session = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage: new InMemoryStorageAdapter() })
    const moveCFirst = op({ operationId: 'move-c', operationType: 'list.move', strategyId: 'json.list-order', payload: { collection: 'sections', id: 'c' } })
    const moveAAfterC = op({ operationId: 'move-a', operationType: 'list.move', strategyId: 'json.list-order', payload: { collection: 'sections', id: 'a', afterId: 'c' } })
    await Promise.all([session.submit(moveCFirst), session.submit(moveAAfterC)])
    const ordered = [...session.canonicalState.sections as JsonObject[]].sort((a, b) => Number(a.orderKey) - Number(b.orderKey))
    expect(ordered.map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(new Set(ordered.map((item) => item.orderKey)).size).toBe(3)
  })

  it('deduplicates repeated operationId without advancing canonical version', async () => {
    const session = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage: new InMemoryStorageAdapter() })
    const operation = op({ operationId: 'same', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Once' } })
    expect((await session.submit(operation)).kind).toBe('accepted')
    const duplicate = await session.submit(operation)
    expect(duplicate.kind).toBe('accepted')
    expect(duplicate.kind === 'accepted' && duplicate.duplicate).toBe(true)
    expect(session.canonicalVersion).toBe(1)
  })

  it('rejects stale strict transactions without mutating state', async () => {
    const session = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage: new InMemoryStorageAdapter() })
    await session.submit(op({ operationId: 'advance', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Advanced' } }))
    const result = await session.submit(op({ operationId: 'strict', operationType: 'transaction.apply', strategyId: 'json.reject-if-stale', baseVersion: 0, payload: { patches: [{ op: 'set', path: '/status', value: 'reviewing' }] } }))
    expect(result.kind).toBe('rejected')
    expect(result.kind === 'rejected' && result.reason.code).toBe('staleVersion')
    expect(session.canonicalState.status).toBe('draft')
    expect(session.canonicalVersion).toBe(1)
  })

  it('recovers snapshot plus later WAL and keeps idempotency after restart', async () => {
    const storage = new InMemoryStorageAdapter<JsonObject>()
    const first = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage, snapshotInterval: 2 })
    for (const [index, title] of ['one', 'two', 'three'].entries()) {
      await first.submit(op({ operationId: `op-${index}`, operationType: 'property.set', strategyId: 'json.property-lww', baseVersion: index, payload: { path: '/title', value: title } }))
    }
    const recovered = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage, snapshotInterval: 2 })
    await recovered.initialize()
    expect(recovered.canonicalVersion).toBe(3)
    expect(recovered.canonicalState.title).toBe('three')
    const duplicate = await recovered.submit(op({ operationId: 'op-0', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'corrupt' } }))
    expect(duplicate.kind === 'accepted' && duplicate.duplicate).toBe(true)
    expect(recovered.canonicalState.title).toBe('three')
  })

  it('requires snapshot resync when a client falls outside the configured recovery window', async () => {
    const session = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage: new InMemoryStorageAdapter(), maxRecoveryGap: 0 })
    await session.submit(op({ operationId: 'advance-gap', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'New' } }))
    const result = await session.submit(op({ operationId: 'too-old', operationType: 'property.set', strategyId: 'json.property-lww', baseVersion: 0, payload: { path: '/title', value: 'Old' } }))
    expect(result.kind).toBe('resyncRequired')
    expect(result.kind === 'resyncRequired' && result.snapshotRef).toContain('/1')
    expect(session.canonicalVersion).toBe(1)
  })

  it('lets a domain pack resolve operations outside the default recovery window', async () => {
    const rebasePack = defineDomainPack<JsonObject>({
      ...pack,
      operationVersionPolicy: { decide: () => ({ kind: 'resolve' }) },
    })
    const session = new AuthoritativeDocumentSession({
      tenantId: 't', documentId: 'd', domainPack: rebasePack,
      storage: new InMemoryStorageAdapter(), maxRecoveryGap: 0,
    })
    await session.submit(op({ operationId: 'advance-rebase', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Advanced' } }))
    const result = await session.submit(op({ operationId: 'stale-rebase', operationType: 'property.set', strategyId: 'json.property-lww', baseVersion: 0, payload: { path: '/title', value: 'Rebased' } }))
    expect(result.kind).toBe('accepted')
    expect(session.canonicalVersion).toBe(2)
    expect(session.canonicalState.title).toBe('Rebased')
  })

  it('runs authorization before a stale-version policy and converts policy failures into rejection', async () => {
    const stages: string[] = []
    const faultyPack = defineDomainPack<JsonObject>({
      ...pack,
      operationVersionPolicy: {
        decide() {
          stages.push('versionPolicy')
          throw new Error('policy failed closed')
        },
      },
    })
    const session = new AuthoritativeDocumentSession({
      tenantId: 't', documentId: 'd', domainPack: faultyPack, storage: new InMemoryStorageAdapter(), maxRecoveryGap: 0,
      hooks: [{ stage: 'authorize', run: () => { stages.push('authorize') } }],
    })
    await session.submit(op({ operationId: 'advance-policy', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Advanced' } }))
    const result = await session.submit(op({ operationId: 'faulty-policy', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Ignored' } }))
    expect(stages).toEqual(['authorize', 'authorize', 'versionPolicy'])
    expect(result.kind).toBe('rejected')
    expect(result.kind === 'rejected' && result.reason).toMatchObject({ code: 'strategyFailure', message: 'policy failed closed' })
    expect(session.canonicalVersion).toBe(1)
  })

  it('identifies concurrent operations by committed canonical version, not their baseVersion', async () => {
    let observedVersions: number[] = []
    const inspectStrategy: ConflictStrategy<JsonObject> = {
      id: 'test.inspect-concurrency', version: '1.0',
      supports: (type) => type === 'inspect.concurrent',
      resolve(context) {
        observedVersions = context.concurrentOperations.map((entry) => entry.canonicalVersion)
        return { kind: 'accept', patches: [{ op: 'set', path: '/status', value: 'inspected' }] }
      },
    }
    const inspectPack = defineDomainPack<JsonObject>({ ...pack, strategies: [...pack.strategies, inspectStrategy] })
    const session = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: inspectPack, storage: new InMemoryStorageAdapter() })
    await session.submit(op({ operationId: 'history-v1', operationType: 'property.set', strategyId: 'json.property-lww', baseVersion: 0, payload: { path: '/title', value: 'One' } }))
    await session.submit(op({ operationId: 'history-v2', operationType: 'property.set', strategyId: 'json.property-lww', baseVersion: 0, payload: { path: '/title', value: 'Two' } }))
    await session.submit(op({ operationId: 'inspect-v3', operationType: 'inspect.concurrent', strategyId: 'test.inspect-concurrency', baseVersion: 1, payload: {} }))
    expect(observedVersions).toEqual([2])
  })

  it('never converts a durable commit into a rejection when post-commit effects fail', async () => {
    class FaultySnapshotStorage extends InMemoryStorageAdapter<JsonObject> {
      override async saveSnapshot(): Promise<void> { throw new Error('snapshot backend unavailable') }
    }
    const storage = new FaultySnapshotStorage()
    const session = new AuthoritativeDocumentSession({ tenantId: 't', documentId: 'd', domainPack: pack, storage, snapshotInterval: 1 })
    session.subscribe(() => { throw new Error('observer unavailable') })
    const result = await session.submit(op({ operationId: 'post-commit', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Durable' } }))
    expect(result.kind).toBe('accepted')
    expect(session.canonicalVersion).toBe(1)
    expect(session.canonicalState.title).toBe('Durable')
    expect((await storage.loadWal('t', 'd', 0))).toHaveLength(1)
  })
})

describe('standalone room cache lifecycle', () => {
  it('protects active connections and starts the idle TTL when the last lease releases', async () => {
    let now = 0
    const core = new CollaborationServerCore({
      domainPack: pack,
      storage: new InMemoryStorageAdapter(),
      roomCachePolicy: { idleTtlMs: 100, maxWarmRooms: 10, scanIntervalMs: 60_000 },
      clock: () => now,
    })
    const lease = await core.acquireRoom('t', 'd')
    now = 101
    expect((await core.sweepRooms()).evicted).toEqual([])
    expect(core.warmRooms()[0]).toMatchObject({ activeConnections: 1, queuedOperations: 0 })

    lease.release()
    now = 200
    expect((await core.sweepRooms()).evicted).toEqual([])
    now = 201
    expect((await core.sweepRooms()).evicted).toEqual([{ key: 't\u0000d', reason: 'idle' }])
    expect(core.warmRoomCount).toBe(0)
    await core.close()
  })

  it('forces a snapshot, deletes demo WAL/snapshot, and recreates an expired room from initial state', async () => {
    let now = 0
    const storage = new InMemoryStorageAdapter<JsonObject>()
    const core = new CollaborationServerCore({
      domainPack: pack,
      storage,
      roomCachePolicy: { idleTtlMs: 100, maxWarmRooms: 10, scanIntervalMs: 60_000 },
      roomDataRetention: 'delete',
      clock: () => now,
    })
    const session = await core.session('t', 'd')
    await session.submit(op({ operationId: 'expiring', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Temporary' } }))
    now = 101
    expect((await core.sweepRooms()).evicted).toHaveLength(1)
    expect(await storage.loadSnapshot('t', 'd')).toBeUndefined()
    expect(await storage.loadWal('t', 'd', -1)).toEqual([])

    const recreated = await core.session('t', 'd')
    expect(recreated.canonicalVersion).toBe(0)
    expect(recreated.canonicalState.title).toBe('Initial')
    await core.close()
  })

  it('evicts the least-recently-used inactive room when the warm-room cap is reached', async () => {
    let now = 0
    const storage = new InMemoryStorageAdapter<JsonObject>()
    const core = new CollaborationServerCore({
      domainPack: pack,
      storage,
      roomCachePolicy: { idleTtlMs: 10_000, maxWarmRooms: 2, scanIntervalMs: 60_000 },
      clock: () => now,
    })
    await core.session('t', 'oldest')
    now = 10
    await core.session('t', 'newer')
    now = 20
    await core.session('t', 'newest')

    expect(core.warmRooms().map((entry) => entry.documentId).sort()).toEqual(['newer', 'newest'])
    expect(await storage.loadSnapshot('t', 'oldest')).toMatchObject({ version: 0 })
    await core.close()
  })

  it('does not evict a room while an operation is queued or committing', async () => {
    class GatedStorage extends InMemoryStorageAdapter<JsonObject> {
      release!: () => void
      private readonly gate = new Promise<void>((resolve) => { this.release = resolve })
      override async appendWal(record: Parameters<InMemoryStorageAdapter<JsonObject>['appendWal']>[0]) {
        await this.gate
        await super.appendWal(record)
      }
    }
    let now = 0
    const storage = new GatedStorage()
    const core = new CollaborationServerCore({
      domainPack: pack,
      storage,
      roomCachePolicy: { idleTtlMs: 100, maxWarmRooms: 10, scanIntervalMs: 60_000 },
      clock: () => now,
    })
    const session = await core.session('t', 'd')
    const submitting = session.submit(op({ operationId: 'queued', operationType: 'property.set', strategyId: 'json.property-lww', payload: { path: '/title', value: 'Committed' } }))
    now = 101
    expect((await core.sweepRooms()).evicted).toEqual([])
    expect(core.warmRooms()[0]?.queuedOperations).toBe(1)

    storage.release()
    await submitting
    now = 202
    expect((await core.sweepRooms()).evicted).toHaveLength(1)
    await core.close()
  })
})
