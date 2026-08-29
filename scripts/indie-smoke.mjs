import { readFile } from 'node:fs/promises'
import { createHmac, randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import WebSocket from 'ws'

const httpOrigin = process.env.COLLABHUB_HTTP_ORIGIN ?? 'http://127.0.0.1:17000'
const webSocketUrl = process.env.COLLABHUB_WS_URL ?? httpOrigin.replace(/^http/, 'ws') + '/collab'
const allowedOrigin = process.env.COLLABHUB_ALLOWED_ORIGIN ?? 'https://app.example.com'
const issuer = process.env.COLLABHUB_JWT_ISSUER ?? 'https://app.example.com'
const audience = process.env.COLLABHUB_JWT_AUDIENCE ?? 'collabhub'
const tenantId = process.env.COLLABHUB_TENANT_ID ?? 'certification'
const documentId = process.env.COLLABHUB_DOCUMENT_ID ?? `indie-smoke-${Date.now()}`
const connectIp = process.env.COLLABHUB_CONNECT_IP

function lookup(_hostname, _options, callback) {
  if (_options?.all) {
    callback(null, [{ address: connectIp, family: 4 }])
    return
  }
  callback(null, connectIp, 4)
}

async function getJson(url, headers) {
  const target = new URL(url)
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest
  return await new Promise((resolve, reject) => {
    const outbound = request(target, {
      headers,
      ...(connectIp ? { lookup } : {}),
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`snapshot API returned ${response.statusCode}: ${body}`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    })
    outbound.setTimeout(15_000, () => outbound.destroy(new Error('snapshot API timed out')))
    outbound.on('error', reject)
    outbound.end()
  })
}

async function token(actorId) {
  const provided = process.env[`COLLABHUB_${actorId.toUpperCase()}_TOKEN`]
  if (provided) return provided
  const secretFile = process.env.COLLABHUB_JWT_SECRET_FILE ?? new URL('../deploy/indie/secrets/jwt-shared-secret', import.meta.url)
  const secret = (await readFile(secretFile, 'utf8')).trim()
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: actorId, tenant_id: tenantId, collabhub_documents: [documentId],
    iss: issuer, aud: audience, iat: now, exp: now + 600,
  })).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

class Peer {
  constructor(actorId, authToken) {
    this.actorId = actorId
    this.authToken = authToken
    this.clientId = `${actorId}-${randomUUID()}`
    this.messages = []
    this.waiters = []
  }

  async connect(lastKnownVersion = 0) {
    this.socket = new WebSocket(webSocketUrl, {
      headers: { Origin: allowedOrigin },
      ...(connectIp ? { lookup } : {}),
    })
    this.socket.on('message', (raw) => this.receive(JSON.parse(String(raw))))
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
    this.send({
      kind: 'hello', protocolVersion: '0.1', tenantId, documentId,
      actorId: this.actorId, clientId: this.clientId, authToken: this.authToken, lastKnownVersion,
    })
    const snapshot = await this.wait((message) => message.kind === 'snapshot')
    await this.wait((message) => message.kind === 'ready')
    return snapshot
  }

  receive(message) {
    const waiter = this.waiters.find((candidate) => candidate.predicate(message))
    if (!waiter) return this.messages.push(message)
    this.waiters.splice(this.waiters.indexOf(waiter), 1)
    clearTimeout(waiter.timer)
    waiter.resolve(message)
  }

  send(message) { this.socket.send(JSON.stringify(message)) }

  wait(predicate, timeoutMs = 15_000) {
    const existing = this.messages.find(predicate)
    if (existing) {
      this.messages.splice(this.messages.indexOf(existing), 1)
      return Promise.resolve(existing)
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        reject(new Error(`${this.actorId} timed out waiting for a server message`))
      }, timeoutMs) }
      this.waiters.push(waiter)
    })
  }

  close() { this.socket?.close() }
}

function operation(peer, operationId, baseVersion, value) {
  return {
    tenantId, documentId, actorId: peer.actorId, clientId: peer.clientId,
    operationId, baseVersion, schemaVersion: '1.0', operationType: 'property.set',
    strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value },
  }
}

const [aliceToken, bobToken] = await Promise.all([token('alice'), token('bob')])
const alice = new Peer('alice', aliceToken)
const bob = new Peer('bob', bobToken)
const trace = []

try {
  const [aliceSnapshot, bobSnapshot] = await Promise.all([alice.connect(), bob.connect()])
  trace.push({ event: 'two_clients_ready', aliceVersion: aliceSnapshot.canonicalVersion, bobVersion: bobSnapshot.canonicalVersion })

  const first = operation(alice, randomUUID(), aliceSnapshot.canonicalVersion, 'Persisted through PostgreSQL')
  alice.send({ kind: 'submit', operation: first })
  const [accepted, canonical] = await Promise.all([
    alice.wait((message) => message.kind === 'accepted' && message.operationId === first.operationId),
    bob.wait((message) => message.kind === 'canonical' && message.operationId === first.operationId),
  ])
  if (accepted.canonicalVersion !== canonical.canonicalVersion) throw new Error('clients did not converge')
  trace.push({ event: 'canonical_convergence', canonicalVersion: accepted.canonicalVersion, operationId: first.operationId })

  alice.send({ kind: 'submit', operation: first })
  const duplicate = await alice.wait((message) => message.kind === 'accepted' && message.operationId === first.operationId && message.duplicate === true)
  trace.push({ event: 'idempotent_duplicate', canonicalVersion: duplicate.canonicalVersion, duplicate: true })

  alice.send({ kind: 'presence', data: { cursor: 7 } })
  const presence = await bob.wait((message) => message.kind === 'presence' && message.data?.cursor === 7)
  trace.push({ event: 'presence_ephemeral', actorId: presence.actorId })

  const durable = await getJson(`${httpOrigin}/v1/tenants/${tenantId}/documents/${documentId}/snapshot`, {
    authorization: `Bearer ${aliceToken}`,
    'x-collabhub-actor-id': 'alice',
    'x-collabhub-client-id': alice.clientId,
  })
  if (durable.snapshot?.title !== 'Persisted through PostgreSQL') throw new Error('snapshot did not contain the committed title')
  trace.push({ event: 'durable_snapshot', canonicalVersion: durable.canonicalVersion, title: durable.snapshot.title })
} finally {
  alice.close()
  bob.close()
}

for (const event of trace) console.log(JSON.stringify({ ...event, tenantId, documentId }))
