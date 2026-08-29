import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'

const webSocketUrl = required('COLLABHUB_REMOTE_WS_URL')
const authToken = required('COLLABHUB_AUTH_TOKEN')
const tenantId = process.env.COLLABHUB_TENANT_ID ?? 'demo'
const documentId = required('COLLABHUB_DOCUMENT_ID')
const actorId = process.env.COLLABHUB_ACTOR_ID ?? 'verifier'
const allowedOrigin = process.env.COLLABHUB_ALLOWED_ORIGIN ?? 'http://127.0.0.1:5193'
const expectedVersion = Number(process.env.COLLABHUB_EXPECTED_VERSION ?? 0)
const expectedNodes = optionalNumber('COLLABHUB_EXPECTED_NODES')
const expectedEdges = optionalNumber('COLLABHUB_EXPECTED_EDGES')
const clientId = `${actorId}-${randomUUID()}`
const socket = new WebSocket(webSocketUrl, { headers: { Origin: allowedOrigin } })

try {
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  socket.send(JSON.stringify({
    kind: 'hello', protocolVersion: '0.1', tenantId, documentId,
    actorId, clientId, authToken, lastKnownVersion: 0,
  }))
  const snapshot = await waitFor(socket, (message) => message.kind === 'snapshot')
  if (snapshot.canonicalVersion < expectedVersion) {
    throw new Error(`expected version >= ${expectedVersion}, received ${snapshot.canonicalVersion}`)
  }
  const nodes = Array.isArray(snapshot.snapshot?.nodes) ? snapshot.snapshot.nodes.length : undefined
  const edges = Array.isArray(snapshot.snapshot?.edges) ? snapshot.snapshot.edges.length : undefined
  if (expectedNodes !== undefined && nodes !== expectedNodes) throw new Error(`expected ${expectedNodes} nodes, received ${nodes}`)
  if (expectedEdges !== undefined && edges !== expectedEdges) throw new Error(`expected ${expectedEdges} edges, received ${edges}`)
  console.log(JSON.stringify({ event: 'remote_snapshot_verified', tenantId, documentId, canonicalVersion: snapshot.canonicalVersion, nodes, edges }))
} finally {
  socket.close()
}

function waitFor(target, predicate, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timed out waiting for remote snapshot'))
    }, timeoutMs)
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw))
      if (!predicate(message)) return
      cleanup()
      resolve(message)
    }
    const onError = (error) => { cleanup(); reject(error) }
    const cleanup = () => {
      clearTimeout(timer)
      target.off('message', onMessage)
      target.off('error', onError)
    }
    target.on('message', onMessage)
    target.on('error', onError)
  })
}

function optionalNumber(name) {
  const value = process.env[name]
  return value === undefined ? undefined : Number(value)
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
