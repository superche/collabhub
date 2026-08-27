import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import { defineDomainPack, type ConflictStrategy, type ResolveResult } from '@collabhub/strategy-sdk'
import { buildGraphCommandPatches, isGraphCommand } from '../src/collab/graph-canonical-patches.js'
import { initialGraphDocument, type GraphDocument } from '../src/domain/graph-document.js'

function invalid(message: string): ResolveResult {
  return { kind: 'reject', reason: { code: 'invalidOperation', message } }
}

const graphDocumentStrategy: ConflictStrategy<JsonObject> = {
  id: 'graph.document',
  version: '1.0',
  supports(operationType, schemaVersion) {
    return schemaVersion === '1.0' && ['node.add', 'node.rename', 'node.move', 'node.delete', 'edge.add', 'edge.delete'].includes(operationType)
  },
  resolve(context) {
    const command = context.operation.payload
    if (!isGraphCommand(command) || command.type !== context.operation.operationType) return invalid('graph command payload does not match operation type')
    try {
      const patches = buildGraphCommandPatches(context.currentState as unknown as GraphDocument, command)
      const revision: CanonicalPatch = { op: 'set', path: '/revision', value: context.currentVersion + 1 }
      return { kind: 'accept', patches: [...patches, revision] }
    } catch (error) {
      return invalid(error instanceof Error ? error.message : String(error))
    }
  },
}

export const GraphDocumentDomainPack = defineDomainPack<JsonObject>({
  id: 'example.react-flow-graph',
  schemaVersion: '1.0',
  strategies: [graphDocumentStrategy],
  invariants: [{
    id: 'graph.valid-references',
    check(state) {
      const graph = state as unknown as GraphDocument
      const nodeIds = graph.nodes.map((node) => node.id)
      const edgeIds = graph.edges.map((edge) => edge.id)
      if (new Set(nodeIds).size !== nodeIds.length) return 'node ids must be unique'
      if (new Set(edgeIds).size !== edgeIds.length) return 'edge ids must be unique'
      if (graph.nodes.some((node) => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) return 'node positions must be finite'
      const nodeSet = new Set(nodeIds)
      if (graph.edges.some((edge) => !nodeSet.has(edge.source) || !nodeSet.has(edge.target))) return 'edge endpoints must exist'
      return true
    },
  }],
  initialState(documentId) { return initialGraphDocument(documentId) as unknown as JsonObject },
})
