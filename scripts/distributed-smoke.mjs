import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'

const composeFile = new URL('../deploy/local/docker-compose.yml', import.meta.url).pathname
const documentId = `smoke-${Date.now()}`
const tenantId = 'acceptance'
const trace = []
let stoppedWorker

function compose(...args) {
  return execFileSync('docker', ['compose', '-f', composeFile, ...args], { encoding: 'utf8' }).trim()
}

class Peer {
  constructor(name, url) {
    this.name = name
    this.url = url
    this.messages = []
    this.waiters = []
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    this.socket.on('message', (raw) => {
      const message = JSON.parse(String(raw))
      const waiter = this.waiters.find((candidate) => candidate.predicate(message))
      if (waiter) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        clearTimeout(waiter.timer)
        waiter.resolve(message)
      } else this.messages.push(message)
    })
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
    this.send({ kind: 'hello', protocolVersion: '0.1', tenantId, documentId, actorId: this.name, clientId: `${this.name}-browser`, lastKnownVersion: 0 })
    this.snapshot = await this.wait((message) => message.kind === 'snapshot')
    await this.wait((message) => message.kind === 'ready')
  }

  send(message) { this.socket.send(JSON.stringify(message)) }

  wait(predicate, timeoutMs = 10_000) {
    const existing = this.messages.find(predicate)
    if (existing) {
      this.messages.splice(this.messages.indexOf(existing), 1)
      return Promise.resolve(existing)
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        reject(new Error(`${this.name} timed out waiting for a message`))
      }, timeoutMs) }
      this.waiters.push(waiter)
    })
  }

  close() { this.socket?.close() }
}

function operation(peer, operationId, baseVersion, value) {
  return {
    tenantId, documentId, actorId: peer.name, clientId: `${peer.name}-browser`, operationId,
    baseVersion, schemaVersion: '1.0', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0',
    payload: { path: '/title', value },
  }
}

async function main() {
  const alice = new Peer('alice', 'ws://127.0.0.1:7001/collab')
  const bob = new Peer('bob', 'ws://127.0.0.1:7002/collab')
  let charlie
  try {
    await Promise.all([alice.connect(), bob.connect()])
    trace.push({ event: 'dual_gateway_ready', documentId, aliceVersion: alice.snapshot.canonicalVersion, bobVersion: bob.snapshot.canonicalVersion })

    const first = operation(alice, randomUUID(), 0, 'Before failover')
    alice.send({ kind: 'submit', operation: first })
    const [accepted, remote] = await Promise.all([
      alice.wait((message) => message.kind === 'accepted' && message.operationId === first.operationId),
      bob.wait((message) => message.kind === 'canonical' && message.operationId === first.operationId),
    ])
    if (accepted.canonicalVersion !== 1 || remote.canonicalVersion !== 1) throw new Error('first operation did not converge at v1')
    trace.push({ event: 'cross_gateway_converged', canonicalVersion: 1, operationId: first.operationId })

    alice.send({ kind: 'submit', operation: first })
    const duplicate = await alice.wait((message) => message.kind === 'accepted' && message.operationId === first.operationId && message.duplicate === true)
    if (duplicate.canonicalVersion !== 1) throw new Error('duplicate advanced canonical version')
    trace.push({ event: 'duplicate_receipt', duplicate: true, canonicalVersion: duplicate.canonicalVersion })

    alice.send({ kind: 'submit', operation: { ...first, payload: { path: '/title', value: 'operationId collision' } } })
    const collision = await alice.wait((message) => message.kind === 'rejected' && message.operationId === first.operationId)
    if (collision.canonicalVersion !== 1 || collision.reason?.code !== 'invalidOperation') throw new Error('operationId collision was not rejected')
    trace.push({ event: 'operation_id_collision_rejected', canonicalVersion: collision.canonicalVersion })

    alice.send({ kind: 'presence', documentId: 'spoofed', actorId: 'mallory', clientId: 'spoofed', data: { cursor: 7 } })
    const presence = await bob.wait((message) => message.kind === 'presence' && message.data?.cursor === 7)
    if (presence.actorId !== 'alice' || presence.documentId !== documentId) throw new Error('presence identity was not derived from the connection')
    const snapshotAfterPresence = await (await fetch(`http://127.0.0.1:7001/v1/tenants/${tenantId}/documents/${documentId}/snapshot`)).json()
    if (snapshotAfterPresence.canonicalVersion !== 1) throw new Error('presence changed durable version')
    trace.push({ event: 'presence_ephemeral', canonicalVersion: snapshotAfterPresence.canonicalVersion, boundActorId: presence.actorId })

    stoppedWorker = compose('exec', '-T', 'postgres', 'psql', '-U', 'collabhub', '-d', 'collabhub', '-At', '-c',
      `SELECT owner_instance_id FROM collabhub_document_head WHERE tenant_id='${tenantId}' AND document_id='${documentId}'`)
    if (!['worker-1', 'worker-2'].includes(stoppedWorker)) throw new Error(`unexpected owner ${stoppedWorker}`)
    compose('stop', stoppedWorker)
    trace.push({ event: 'owner_stopped', owner: stoppedWorker })

    const second = operation(bob, randomUUID(), 1, 'After failover')
    bob.send({ kind: 'submit', operation: second })
    const [acceptedAfterFailover, remoteAfterFailover] = await Promise.all([
      bob.wait((message) => message.kind === 'accepted' && message.operationId === second.operationId, 15_000),
      alice.wait((message) => message.kind === 'canonical' && message.operationId === second.operationId, 15_000),
    ])
    if (acceptedAfterFailover.canonicalVersion !== 2 || remoteAfterFailover.canonicalVersion !== 2) throw new Error('failover operation did not converge at v2')
    trace.push({ event: 'owner_failover_converged', from: stoppedWorker, canonicalVersion: 2, operationId: second.operationId })

    const restOperation = operation({ name: 'spoofed-actor' }, randomUUID(), 2, 'REST through authority')
    const restResponse = await fetch(`http://127.0.0.1:7001/v1/tenants/${tenantId}/documents/${documentId}/operations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-collabhub-actor-id': 'api-user', 'x-collabhub-client-id': 'api-client' },
      body: JSON.stringify(restOperation),
    })
    const restResult = await restResponse.json()
    if (!restResponse.ok || restResult.kind !== 'accepted' || restResult.canonicalVersion !== 3) throw new Error(`authoritative REST operation failed: ${JSON.stringify(restResult)}`)
    await Promise.all([
      alice.wait((message) => message.kind === 'canonical' && message.operationId === restOperation.operationId),
      bob.wait((message) => message.kind === 'canonical' && message.operationId === restOperation.operationId),
    ])
    trace.push({ event: 'rest_uses_authoritative_path', canonicalVersion: restResult.canonicalVersion, operationId: restOperation.operationId })

    charlie = new Peer('charlie', 'ws://127.0.0.1:7090/collab')
    await charlie.connect()
    if (charlie.snapshot.canonicalVersion !== 3 || charlie.snapshot.snapshot.title !== 'REST through authority') throw new Error('snapshot recovery did not materialize v3')
    trace.push({ event: 'snapshot_recovery', canonicalVersion: charlie.snapshot.canonicalVersion, title: charlie.snapshot.snapshot.title })
  } finally {
    alice.close()
    bob.close()
    charlie?.close()
    if (stoppedWorker) compose('start', stoppedWorker)
  }
}

await main()
for (const item of trace) console.log(JSON.stringify(item))
