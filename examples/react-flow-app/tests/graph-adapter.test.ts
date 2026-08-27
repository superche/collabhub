import { describe, expect, it } from 'vitest'
import { adaptGraphCommand } from '../src/collab/graph-command-adapter.js'
import { buildGraphCommandPatches } from '../src/collab/graph-canonical-patches.js'
import { initialGraphDocument } from '../src/domain/graph-document.js'

describe('React Flow command adapter', () => {
  it('turns a drag stop into one incremental node operation', () => {
    const document = initialGraphDocument('react-flow')
    const operation = adaptGraphCommand({
      type: 'node.move', nodeId: 'build', position: { x: 480, y: 160 },
    }, document)

    expect(operation).toMatchObject({
      operationType: 'node.move',
      strategyId: 'graph.document',
      payload: { type: 'node.move', nodeId: 'build', position: { x: 480, y: 160 } },
      optimisticPatches: [{ op: 'entityUpsert', collection: 'nodes', id: 'build' }],
    })
    expect(JSON.stringify(operation.payload)).not.toContain('edges')
    expect(JSON.stringify(operation.payload)).not.toContain('nodes')
  })

  it('expresses linked deletion as multiple patches instead of a graph replacement', () => {
    const patches = buildGraphCommandPatches(initialGraphDocument('react-flow'), {
      type: 'node.delete', nodeId: 'build',
    })

    expect(patches).toEqual([
      { op: 'entityDelete', collection: 'nodes', id: 'build' },
      { op: 'entityDelete', collection: 'edges', id: 'build-ship' },
    ])
    expect(patches).not.toContainEqual(expect.objectContaining({ op: 'set', path: '' }))
  })
})
