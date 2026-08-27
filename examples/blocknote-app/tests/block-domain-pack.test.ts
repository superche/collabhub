import { describe, expect, it } from 'vitest'
import type { CollaborationOperation, JsonObject } from '@collabhub/protocol'
import { AuthoritativeDocumentSession, InMemoryStorageAdapter } from '@collabhub/server-core'
import { BlockDocumentDomainPack } from '../server/block-domain-pack.js'
import type { BlockDocument } from '../src/domain/block-document.js'

function operation(sequence: number, operationType: string, payload: unknown, baseVersion = 0): CollaborationOperation {
  return {
    tenantId: 'demo', documentId: 'blocknote', actorId: `actor-${sequence}`, clientId: `client-${sequence}`,
    operationId: `operation-${sequence}`, baseVersion, schemaVersion: '1.0', operationType,
    strategyId: 'block-document.sequence', strategyVersion: '1.0', payload,
  }
}

describe('BlockNote server-authoritative Domain Pack', () => {
  it('orders concurrent updates deterministically and deduplicates operationId', async () => {
    const session = new AuthoritativeDocumentSession<JsonObject>({
      tenantId: 'demo', documentId: 'blocknote', domainPack: BlockDocumentDomainPack,
      storage: new InMemoryStorageAdapter(), snapshotInterval: 2,
    })
    const initial = BlockDocumentDomainPack.initialState('blocknote') as unknown as BlockDocument
    const intro = initial.blocks.find((record) => record.id === 'intro')!.block
    const alice = operation(1, 'block.update', { type: 'block.update', block: { ...intro, content: [{ type: 'text', text: 'Alice', styles: {} }] } })
    const bob = operation(2, 'block.update', { type: 'block.update', block: { ...intro, content: [{ type: 'text', text: 'Bob', styles: {} }] } })

    expect((await session.submit(alice)).kind).toBe('accepted')
    expect((await session.submit(bob)).kind).toBe('accepted')
    const duplicate = await session.submit(alice)

    expect(duplicate).toMatchObject({ kind: 'accepted', duplicate: true, canonicalVersion: 1 })
    expect(session.canonicalVersion).toBe(2)
    const state = session.canonicalState as unknown as BlockDocument
    expect(JSON.stringify(state.blocks.find((record) => record.id === 'intro')!.block.content)).toContain('Bob')
  })

  it('applies block moves as canonical list patches', async () => {
    const session = new AuthoritativeDocumentSession<JsonObject>({
      tenantId: 'demo', documentId: 'blocknote', domainPack: BlockDocumentDomainPack, storage: new InMemoryStorageAdapter(),
    })
    const result = await session.submit(operation(3, 'block.move', { type: 'block.move', blockId: 'notes' }))

    expect(result).toMatchObject({ kind: 'accepted', patches: [{ op: 'listOrder', collection: 'blocks', id: 'notes' }] })
    const state = session.canonicalState as unknown as BlockDocument
    expect([...state.blocks].sort((left, right) => Number(left.orderKey) - Number(right.orderKey))[0]?.id).toBe('notes')
  })
})
