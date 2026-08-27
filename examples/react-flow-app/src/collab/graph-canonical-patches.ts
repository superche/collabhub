import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import { applyGraphCommand, type GraphCommand, type GraphDocument } from '../domain/graph-document.js'

export function isGraphCommand(value: unknown): value is GraphCommand {
  if (!value || typeof value !== 'object') return false
  return ['node.add', 'node.rename', 'node.move', 'node.delete', 'edge.add', 'edge.delete'].includes(String((value as { type?: unknown }).type))
}

export function buildGraphCommandPatches(document: GraphDocument, command: GraphCommand): CanonicalPatch[] {
  const next = applyGraphCommand(document, command)
  if (command.type === 'node.add') {
    return [{ op: 'entityUpsert', collection: 'nodes', id: command.node.id, value: command.node as unknown as JsonObject }]
  }
  if (command.type === 'node.rename') {
    return [{ op: 'entityUpsert', collection: 'nodes', id: command.nodeId, value: { id: command.nodeId, label: command.label } }]
  }
  if (command.type === 'node.move') {
    return [{ op: 'entityUpsert', collection: 'nodes', id: command.nodeId, value: { id: command.nodeId, position: command.position as unknown as JsonObject } }]
  }
  if (command.type === 'node.delete') {
    const incidentEdges = document.edges.filter((edge) => edge.source === command.nodeId || edge.target === command.nodeId)
    return [
      { op: 'entityDelete', collection: 'nodes', id: command.nodeId },
      ...incidentEdges.map((edge): CanonicalPatch => ({ op: 'entityDelete', collection: 'edges', id: edge.id })),
    ]
  }
  if (command.type === 'edge.add') {
    const edge = next.edges.find((candidate) => candidate.id === command.edge.id)!
    return [{ op: 'entityUpsert', collection: 'edges', id: edge.id, value: edge as unknown as JsonObject }]
  }
  return [{ op: 'entityDelete', collection: 'edges', id: command.edgeId }]
}
