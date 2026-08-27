export interface GraphPosition { x: number; y: number }

export interface GraphNodeRecord {
  id: string
  position: GraphPosition
  label: string
  tone: 'green' | 'blue' | 'amber'
}

export interface GraphEdgeRecord {
  id: string
  source: string
  target: string
  label?: string
}

export interface GraphDocument {
  id: string
  revision: number
  nodes: GraphNodeRecord[]
  edges: GraphEdgeRecord[]
}

export type GraphCommand =
  | { type: 'node.add'; node: GraphNodeRecord }
  | { type: 'node.rename'; nodeId: string; label: string }
  | { type: 'node.move'; nodeId: string; position: GraphPosition }
  | { type: 'node.delete'; nodeId: string }
  | { type: 'edge.add'; edge: GraphEdgeRecord }
  | { type: 'edge.delete'; edgeId: string }

export interface GraphCommandResult {
  ok: boolean
  canonicalVersion: number
  reason?: string
}

export function initialGraphDocument(id: string): GraphDocument {
  return {
    id,
    revision: 0,
    nodes: [
      { id: 'build', position: { x: 180, y: 170 }, label: 'Build', tone: 'green' },
      { id: 'ship', position: { x: 520, y: 170 }, label: 'Ship', tone: 'amber' },
    ],
    edges: [
      { id: 'build-ship', source: 'build', target: 'ship' },
    ],
  }
}

export function applyGraphCommand(document: GraphDocument, command: GraphCommand): GraphDocument {
  if (command.type === 'node.add') {
    if (document.nodes.some((node) => node.id === command.node.id)) throw new Error('node already exists')
    return { ...document, revision: document.revision + 1, nodes: [...document.nodes, command.node] }
  }
  if (command.type === 'node.rename') {
    if (!document.nodes.some((node) => node.id === command.nodeId)) throw new Error('node does not exist')
    return { ...document, revision: document.revision + 1, nodes: document.nodes.map((node) => node.id === command.nodeId ? { ...node, label: command.label } : node) }
  }
  if (command.type === 'node.move') {
    if (!document.nodes.some((node) => node.id === command.nodeId)) throw new Error('node does not exist')
    if (!Number.isFinite(command.position.x) || !Number.isFinite(command.position.y)) throw new Error('node position must be finite')
    return { ...document, revision: document.revision + 1, nodes: document.nodes.map((node) => node.id === command.nodeId ? { ...node, position: command.position } : node) }
  }
  if (command.type === 'node.delete') {
    if (!document.nodes.some((node) => node.id === command.nodeId)) throw new Error('node does not exist')
    return {
      ...document,
      revision: document.revision + 1,
      nodes: document.nodes.filter((node) => node.id !== command.nodeId),
      edges: document.edges.filter((edge) => edge.source !== command.nodeId && edge.target !== command.nodeId),
    }
  }
  if (command.type === 'edge.add') {
    if (document.edges.some((edge) => edge.id === command.edge.id)) throw new Error('edge already exists')
    if (!document.nodes.some((node) => node.id === command.edge.source) || !document.nodes.some((node) => node.id === command.edge.target)) throw new Error('edge endpoints must exist')
    return { ...document, revision: document.revision + 1, edges: [...document.edges, command.edge] }
  }
  if (!document.edges.some((edge) => edge.id === command.edgeId)) throw new Error('edge does not exist')
  return { ...document, revision: document.revision + 1, edges: document.edges.filter((edge) => edge.id !== command.edgeId) }
}
