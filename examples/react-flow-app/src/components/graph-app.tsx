import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { GraphApplicationRuntime } from '../application/runtime.js'
import type { GraphCommand, GraphDocument, GraphNodeRecord } from '../domain/graph-document.js'

type CanvasNode = Node<{ label: string; tone: GraphNodeRecord['tone'] }>

function projectNodes(document: GraphDocument): CanvasNode[] {
  return document.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: { label: node.label, tone: node.tone },
    className: `graph-node tone-${node.tone}`,
  }))
}

function projectEdges(document: GraphDocument): Edge[] {
  return document.edges.map((edge) => ({ ...edge, animated: true }))
}

export function GraphApp({ runtime }: { runtime: GraphApplicationRuntime }) {
  const document = useSyncExternalStore(
    (listener) => runtime.subscribeDocument(listener),
    () => runtime.getDocument(),
  )
  const [, refreshDiagnostics] = useState(0)
  const diagnostics = runtime.diagnostics()
  const [nodes, setNodes] = useState<CanvasNode[]>(() => projectNodes(document))
  const [edges, setEdges] = useState<Edge[]>(() => projectEdges(document))
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>()
  const [networkAvailable, setNetworkAvailable] = useState(true)

  useEffect(() => runtime.subscribeDiagnostics(() => refreshDiagnostics((value) => value + 1)), [runtime])
  useEffect(() => { setNodes(projectNodes(document)); setEdges(projectEdges(document)) }, [document])
  useEffect(() => () => runtime.close(), [runtime])

  const execute = useCallback((command: GraphCommand) => { void runtime.execute(command) }, [runtime])
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
    for (const change of changes) if (change.type === 'remove') execute({ type: 'node.delete', nodeId: change.id })
  }, [execute])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
    for (const change of changes) if (change.type === 'remove') execute({ type: 'edge.delete', edgeId: change.id })
  }, [execute])
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    execute({
      type: 'edge.add',
      edge: { id: `${connection.source}-${connection.target}-${crypto.randomUUID().slice(0, 5)}`, source: connection.source, target: connection.target },
    })
  }, [execute])

  const addNode = () => {
    const sequence = document.nodes.length + 1
    execute({
      type: 'node.add',
      node: { id: `node-${crypto.randomUUID().slice(0, 6)}`, label: `Step ${sequence}`, tone: 'green', position: { x: 190 + sequence * 36, y: 300 } },
    })
  }
  const connectFirstLast = () => {
    const source = document.nodes.at(0)?.id
    const target = document.nodes.at(-1)?.id
    if (!source || !target || source === target) return
    execute({ type: 'edge.add', edge: { id: `${source}-${target}-${crypto.randomUUID().slice(0, 5)}`, source, target, label: 'shortcut' } })
  }
  const deleteSelection = () => {
    if (selectedNodeId) execute({ type: 'node.delete', nodeId: selectedNodeId })
    else if (selectedEdgeId) execute({ type: 'edge.delete', edgeId: selectedEdgeId })
    setSelectedNodeId(undefined)
    setSelectedEdgeId(undefined)
  }
  const toggleNetwork = () => {
    const next = !networkAvailable
    setNetworkAvailable(next)
    runtime.setNetworkAvailable(next)
  }

  return <main>
    <header>
      <div><span className="eyebrow">COLLABHUB EXAMPLE</span><h1>React Flow adapter</h1><p>React Flow renders the graph. GraphDocument remains canonical and renderer-independent.</p></div>
      <div className="header-actions">
        <a className="github-star" href="https://github.com/superche/collabhub" target="_blank" rel="noreferrer" aria-label="Star CollabHub on GitHub">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.7 2.84 5.76 6.36.92-4.6 4.49 1.09 6.33L12 17.21 6.31 20.2l1.09-6.33-4.6-4.49 6.36-.92L12 2.7Z" /></svg>
          <span>Star on GitHub</span>
        </a>
        <div className="actor"><span>Client</span><strong>{runtime.actorId}</strong></div>
      </div>
    </header>
    <section className="layout">
      <article className="canvas-card">
        <div className="toolbar">
          <div><strong>Graph workspace</strong><span>{document.nodes.length} nodes · {document.edges.length} edges</span></div>
          <div className="toolbar-actions">
            <button data-testid="add-node" onClick={addNode}>Add node</button>
            <button data-testid="connect-nodes" className="secondary" onClick={connectFirstLast}>Connect first → last</button>
            <button data-testid="delete-selection" className="danger" disabled={!selectedNodeId && !selectedEdgeId} onClick={deleteSelection}>Delete</button>
          </div>
        </div>
        <div className="graph-canvas" data-testid="graph-canvas">
          <ReactFlow<CanvasNode, Edge>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={(_event, node) => execute({ type: 'node.move', nodeId: node.id, position: { x: Math.round(node.position.x), y: Math.round(node.position.y) } })}
            onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
              setSelectedNodeId(selectedNodes.at(0)?.id)
              setSelectedEdgeId(selectedEdges.at(0)?.id)
            }}
            fitView
            minZoom={0.45}
            maxZoom={1.8}
            nodesConnectable
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <MiniMap pannable zoomable />
            <Controls />
            <Background gap={22} size={1.2} color="#cbd8d0" />
          </ReactFlow>
        </div>
      </article>
      <aside className="diagnostics" data-testid="react-flow-diagnostics">
        <div className="diagnostics-heading"><h2>Collab trace</h2><span className={`status ${diagnostics.connection}`}>{diagnostics.connection}</span></div>
        <Metric label="Canonical version" value={diagnostics.canonicalVersion} testId="react-flow-version" />
        <Metric label="Pending operations" value={diagnostics.pendingCount} testId="react-flow-pending" />
        <Metric label="Submitted operations" value={diagnostics.submittedOperations} testId="react-flow-submitted" />
        <Metric label="Drag commits" value={diagnostics.submittedMoves} testId="react-flow-moves" />
        <Metric label="Reconnects / resyncs" value={`${diagnostics.reconnectCount} / ${diagnostics.resyncCount}`} testId="react-flow-recovery" />
        <div className="trace"><span>Last operation</span><code data-testid="react-flow-last-operation">{diagnostics.lastOperation ?? 'none'}</code></div>
        <button data-testid="network-toggle" className="network-toggle" onClick={toggleNetwork}>{networkAvailable ? 'Simulate offline' : 'Reconnect'}</button>
        <p>Drag frames stay local. Pointer-up emits one incremental node.move; the full graph is only sent in recovery snapshots.</p>
      </aside>
    </section>
  </main>
}

function Metric({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return <div className="metric"><span>{label}</span><strong data-testid={testId}>{value}</strong></div>
}
