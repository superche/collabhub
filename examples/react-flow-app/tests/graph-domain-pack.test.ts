import { describe, expect, it } from 'vitest'
import type { CollaborationOperation, JsonObject } from '@collabhub/protocol'
import { AuthoritativeDocumentSession, InMemoryStorageAdapter } from '@collabhub/server-core'
import { GraphDocumentDomainPack } from '../server/graph-domain-pack.js'
import type { GraphDocument } from '../src/domain/graph-document.js'

function operation(sequence: number, operationType: string, payload: unknown, baseVersion = 0): CollaborationOperation {
  return {
    tenantId: 'demo', documentId: 'react-flow', actorId: `actor-${sequence}`, clientId: `client-${sequence}`,
    operationId: `operation-${sequence}`, baseVersion, schemaVersion: '1.0', operationType,
    strategyId: 'graph.document', strategyVersion: '1.0', payload,
  }
}

function session(): AuthoritativeDocumentSession<JsonObject> {
  return new AuthoritativeDocumentSession<JsonObject>({
    tenantId: 'demo', documentId: 'react-flow', domainPack: GraphDocumentDomainPack,
    storage: new InMemoryStorageAdapter(), snapshotInterval: 2,
  })
}

describe('React Flow server-authoritative Domain Pack', () => {
  it('resolves concurrent node moves in canonical arrival order and deduplicates operationId', async () => {
    const graph = session()
    const alice = operation(1, 'node.move', { type: 'node.move', nodeId: 'build', position: { x: 400, y: 90 } })
    const bob = operation(2, 'node.move', { type: 'node.move', nodeId: 'build', position: { x: 460, y: 130 } })

    expect(await graph.submit(alice)).toMatchObject({ kind: 'accepted', canonicalVersion: 1 })
    expect(await graph.submit(bob)).toMatchObject({ kind: 'accepted', canonicalVersion: 2 })
    expect(await graph.submit(alice)).toMatchObject({ kind: 'accepted', duplicate: true, canonicalVersion: 1 })

    const state = graph.canonicalState as unknown as GraphDocument
    expect(state.nodes.find((node) => node.id === 'build')?.position).toEqual({ x: 460, y: 130 })
    expect(state.revision).toBe(2)
  })

  it('deletes a node and all incident edges in one linked canonical commit', async () => {
    const graph = session()
    const result = await graph.submit(operation(3, 'node.delete', { type: 'node.delete', nodeId: 'build' }))

    expect(result).toMatchObject({
      kind: 'accepted',
      canonicalVersion: 1,
      patches: [
        { op: 'entityDelete', collection: 'nodes', id: 'build' },
        { op: 'entityDelete', collection: 'edges', id: 'build-ship' },
        { op: 'set', path: '/revision', value: 1 },
      ],
    })
    const state = graph.canonicalState as unknown as GraphDocument
    expect(state.nodes.some((node) => node.id === 'build')).toBe(false)
    expect(state.edges).toEqual([])
    expect(state.revision).toBe(1)
  })

  it('rejects edges whose endpoints do not exist without advancing canonical state', async () => {
    const graph = session()
    const result = await graph.submit(operation(4, 'edge.add', {
      type: 'edge.add', edge: { id: 'invalid', source: 'build', target: 'missing' },
    }))

    expect(result).toMatchObject({ kind: 'rejected', reason: { code: 'invalidOperation' } })
    expect(graph.canonicalVersion).toBe(0)
  })
})
