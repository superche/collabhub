import { describe, expect, it } from 'vitest'
import { jsonStrategies } from '@collabhub/domain-json'
import type { CollaborationOperation, JsonObject } from '@collabhub/protocol'
import { defineDomainPack } from '@collabhub/strategy-sdk'
import { AuthoritativeDocumentSession, InMemoryStorageAdapter } from './index.js'

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
})
