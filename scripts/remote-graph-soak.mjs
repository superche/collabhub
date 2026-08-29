import { performance } from 'node:perf_hooks'
import WebSocket from 'ws'

const httpOrigin = required('COLLABHUB_REMOTE_HTTP_ORIGIN').replace(/\/$/, '')
const webSocketUrl = process.env.COLLABHUB_REMOTE_WS_URL ?? httpOrigin.replace(/^http/, 'ws') + '/collab'
const authToken = required('COLLABHUB_AUTH_TOKEN')
const tenantId = process.env.COLLABHUB_TENANT_ID ?? 'demo'
const documentId = required('COLLABHUB_DOCUMENT_ID')
const actorId = process.env.COLLABHUB_ACTOR_ID ?? 'soak'
const allowedOrigin = process.env.COLLABHUB_ALLOWED_ORIGIN ?? 'http://127.0.0.1:5193'
const durationMs = Number(process.env.COLLABHUB_SOAK_DURATION_MS ?? 600_000)
const intervalMs = Number(process.env.COLLABHUB_SOAK_INTERVAL_MS ?? 250)
const clientId = `${actorId}-http`
const latencies = []
let remoteEvents = 0
let accepted = 0
let retries = 0
let healthChecks = 0

const observer = new WebSocket(webSocketUrl, { headers: { Origin: allowedOrigin } })
await new Promise((resolve, reject) => { observer.once('open', resolve); observer.once('error', reject) })
observer.on('message', (raw) => {
  const message = JSON.parse(String(raw))
  if (message.kind === 'canonical' && String(message.operationId).startsWith(`soak-${documentId}-`)) remoteEvents++
})
observer.send(JSON.stringify({
  kind: 'hello', protocolVersion: '0.1', tenantId, documentId,
  actorId, clientId: `${actorId}-observer`, authToken, lastKnownVersion: 0,
}))
const initial = await waitFor(observer, (message) => message.kind === 'snapshot')
await waitFor(observer, (message) => message.kind === 'ready')
let canonicalVersion = initial.canonicalVersion

const started = performance.now()
let nextHealthCheck = started
try {
  while (performance.now() - started < durationMs) {
    const index = accepted
    const operation = {
      tenantId, documentId, actorId, clientId,
      operationId: `soak-${documentId}-${index}`,
      baseVersion: canonicalVersion,
      schemaVersion: '1.0', operationType: 'node.move', strategyId: 'graph.document', strategyVersion: '1.0',
      payload: { type: 'node.move', nodeId: 'build', position: { x: 180 + (index % 40), y: 170 + (index % 30) } },
    }
    const requestStarted = performance.now()
    const response = await fetch(`${httpOrigin}/v1/tenants/${tenantId}/documents/${documentId}/operations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(operation),
    })
    const result = await response.json()
    if (result.kind === 'retryLater' || response.status === 503) {
      retries++
      await delay(result.retryAfterMs ?? intervalMs)
      continue
    }
    if (result.kind !== 'accepted') throw new Error(`operation ${index} failed: HTTP ${response.status} ${JSON.stringify(result)}`)
    latencies.push(performance.now() - requestStarted)
    accepted++
    canonicalVersion = result.canonicalVersion
    if (performance.now() >= nextHealthCheck) {
      const ready = await fetch(`${httpOrigin}/readyz`)
      if (!ready.ok) throw new Error(`readiness failed with HTTP ${ready.status}`)
      healthChecks++
      nextHealthCheck = performance.now() + 30_000
    }
    await delay(intervalMs)
  }

  const convergenceDeadline = performance.now() + 15_000
  while (remoteEvents < accepted && performance.now() < convergenceDeadline) await delay(50)
  if (remoteEvents !== accepted) throw new Error(`observer received ${remoteEvents}/${accepted} canonical events`)
  const snapshotResponse = await fetch(`${httpOrigin}/v1/tenants/${tenantId}/documents/${documentId}/snapshot`, { headers: headers(false) })
  const snapshot = await snapshotResponse.json()
  if (!snapshotResponse.ok || snapshot.canonicalVersion !== canonicalVersion) {
    throw new Error(`final snapshot mismatch: HTTP ${snapshotResponse.status} ${JSON.stringify(snapshot)}`)
  }
  console.log(JSON.stringify({
    event: 'remote_graph_soak_passed', tenantId, documentId,
    durationSeconds: Number(((performance.now() - started) / 1000).toFixed(1)),
    accepted, retries, remoteEvents, healthChecks, canonicalVersion,
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99) },
  }))
} finally {
  observer.close()
}

function headers(json = true) {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    authorization: `Bearer ${authToken}`,
    'x-collabhub-actor-id': actorId,
    'x-collabhub-client-id': clientId,
  }
}

function waitFor(socket, predicate, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('timed out waiting for WebSocket message')) }, timeoutMs)
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw))
      if (!predicate(message)) return
      cleanup()
      resolve(message)
    }
    const onError = (error) => { cleanup(); reject(error) }
    const cleanup = () => { clearTimeout(timer); socket.off('message', onMessage); socket.off('error', onError) }
    socket.on('message', onMessage)
    socket.on('error', onError)
  })
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(2))
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)) }

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
