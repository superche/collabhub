import { performance } from 'node:perf_hooks'
import WebSocket from 'ws'

const operations = Number(process.env.BENCH_OPERATIONS ?? 500)
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 32)
const tenantId = 'benchmark'
const documentId = `distributed-${Date.now()}`
let remoteEvents = 0

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const bob = new WebSocket('ws://127.0.0.1:7002/collab')
await new Promise((resolve, reject) => { bob.once('open', resolve); bob.once('error', reject) })
bob.on('message', (raw) => {
  const message = JSON.parse(String(raw))
  if (message.kind === 'canonical' && message.operationId.startsWith('bench-')) remoteEvents++
})
bob.send(JSON.stringify({ kind: 'hello', protocolVersion: '0.1', tenantId, documentId, actorId: 'observer', clientId: 'gateway-2', lastKnownVersion: 0 }))
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('observer handshake timed out')), 5000)
  const listener = (raw) => {
    if (JSON.parse(String(raw)).kind !== 'ready') return
    clearTimeout(timer)
    bob.off('message', listener)
    resolve()
  }
  bob.on('message', listener)
})

const latencies = []
let cursor = 0
async function submit(index) {
  const operationId = `bench-${documentId}-${index}`
  const operation = {
    tenantId, documentId, actorId: 'benchmark', clientId: 'http', operationId,
    baseVersion: 0, schemaVersion: '1.0', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0',
    payload: { path: '/title', value: `value-${index}` },
  }
  while (true) {
    const started = performance.now()
    const response = await fetch(`http://127.0.0.1:7001/v1/tenants/${tenantId}/documents/${documentId}/operations`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-collabhub-actor-id': 'benchmark', 'x-collabhub-client-id': 'http' },
      body: JSON.stringify(operation),
    })
    const result = await response.json()
    if (result.kind === 'retryLater') {
      await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs))
      continue
    }
    if (result.kind !== 'accepted') throw new Error(`operation ${index} failed: ${JSON.stringify(result)}`)
    latencies.push(performance.now() - started)
    return
  }
}

async function runner() {
  while (true) {
    const index = cursor++
    if (index >= operations) return
    await submit(index)
  }
}

const started = performance.now()
await Promise.all(Array.from({ length: concurrency }, () => runner()))
const acceptedAt = performance.now()
while (remoteEvents < operations && performance.now() - acceptedAt < 10_000) await new Promise((resolve) => setTimeout(resolve, 20))
const finished = performance.now()
bob.close()
if (remoteEvents !== operations) throw new Error(`remote Gateway observed ${remoteEvents}/${operations} canonical events`)

console.log(JSON.stringify({
  documentId,
  operations,
  concurrency,
  acceptedQps: Number((operations / ((acceptedAt - started) / 1000)).toFixed(1)),
  convergedQps: Number((operations / ((finished - started) / 1000)).toFixed(1)),
  requestLatencyMs: {
    p50: Number(percentile(latencies, 0.5).toFixed(2)),
    p95: Number(percentile(latencies, 0.95).toFixed(2)),
    p99: Number(percentile(latencies, 0.99).toFixed(2)),
  },
  remoteCanonicalEvents: remoteEvents,
}))
