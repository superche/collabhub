import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'
import { applyCanonicalPatches, jsonStrategies } from '@collabhub/domain-json'
import { PROTOCOL_VERSION, type JsonObject, type ServerWireMessage } from '@collabhub/protocol'
import { defineDomainPack } from '@collabhub/strategy-sdk'
import { FileStorageAdapter, startJsonCollaborationServer, startStandaloneWebSocketServer, type StandaloneWebSocketServerHandle } from './index.js'

const domainPack = defineDomainPack<JsonObject>({
  id: 'test.quickstart', schemaVersion: '1.0', strategies: jsonStrategies,
  initialState: () => ({ title: 'Untitled' }),
})

describe('standalone WebSocket adapter', () => {
  let handle: StandaloneWebSocketServerHandle<JsonObject> | undefined
  const clients: WebSocket[] = []
  afterEach(async () => {
    for (const client of clients) client.close()
    await handle?.close()
  })

  it('requires explicit authentication or an insecure local opt-in', async () => {
    await expect(startStandaloneWebSocketServer({ domainPack })).rejects.toThrow(/authenticate is required/)
  })

  it('starts a secure JSON server without exposing Domain Pack plumbing', async () => {
    handle = await startJsonCollaborationServer({
      initialState: () => ({ title: 'Untitled' }), authToken: 'shared-secret', allowedOrigins: ['https://app.example'],
    })
    const rejected = new WebSocket(handle.webSocketUrl, { origin: 'https://evil.example' })
    await expect(upgradeRejectionStatus(rejected)).resolves.toBe(403)
    const alice = await connect(handle.webSocketUrl, 'alice', { origin: 'https://app.example', authToken: 'shared-secret' })
    clients.push(alice)
  })

  it('persists snapshots and WAL for the standalone Docker service', async () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'collabhub-file-storage-'))
    try {
      const storage = new FileStorageAdapter<JsonObject>(directory)
      await storage.appendWal({
        tenantId: 't', documentId: 'd', version: 1, committedAt: new Date().toISOString(), patches: [{ op: 'set', path: '/title', value: 'Saved' }],
        operation: { tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c', operationId: 'o1', baseVersion: 0, schemaVersion: '1.0', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: 'Saved' } },
      })
      await storage.saveSnapshot({ tenantId: 't', documentId: 'd', version: 1, schemaVersion: '1.0', state: { title: 'Saved' }, snapshotRef: 's1' })
      await expect(storage.loadWal('t', 'd', 0)).resolves.toHaveLength(1)
      await expect(storage.loadSnapshot('t', 'd')).resolves.toMatchObject({ version: 1, state: { title: 'Saved' } })
      await storage.deleteDocument('t', 'd')
      await expect(storage.loadWal('t', 'd', 0)).resolves.toEqual([])
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('binds connection identity and synchronizes canonical patches', async () => {
    handle = await startStandaloneWebSocketServer({ domainPack, allowInsecureDevelopmentIdentity: true })
    const alice = await connect(handle.webSocketUrl, 'alice')
    const bob = await connect(handle.webSocketUrl, 'bob')
    clients.push(alice, bob)
    const bobCanonical = nextMessage(bob, 'canonical')
    const aliceAccepted = nextMessage(alice, 'accepted')
    alice.send(JSON.stringify({
      kind: 'submit',
      operation: {
        tenantId: 'spoofed', documentId: 'spoofed', actorId: 'mallory', clientId: 'mallory', operationId: 'alice-1',
        baseVersion: 0, schemaVersion: '1.0', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0',
        payload: { path: '/title', value: 'Shared' },
      },
    }))
    await expect(aliceAccepted).resolves.toMatchObject({ kind: 'accepted', canonicalVersion: 1 })
    await expect(bobCanonical).resolves.toMatchObject({ kind: 'canonical', actorId: 'alice', canonicalVersion: 1 })
    expect(applyCanonicalPatches({ title: 'Untitled' }, [{ op: 'set', path: '/title', value: 'Shared' }])).toEqual({ title: 'Shared' })
  })
})

async function connect(url: string, actorId: string, options: { origin?: string; authToken?: string } = {}): Promise<WebSocket> {
  const socket = new WebSocket(url, options.origin ? { origin: options.origin } : undefined)
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const ready = nextMessage(socket, 'ready')
  socket.send(JSON.stringify({
    kind: 'hello', protocolVersion: PROTOCOL_VERSION, tenantId: 'demo', documentId: 'document',
    actorId, clientId: `${actorId}-client`, lastKnownVersion: 0, authToken: options.authToken,
  }))
  await ready
  return socket
}

function closeCode(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => { socket.once('close', resolve); socket.once('error', reject) })
}

function upgradeRejectionStatus(socket: WebSocket): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    socket.once('unexpected-response', (_request, response) => {
      response.resume()
      resolve(response.statusCode)
    })
    socket.once('open', () => reject(new Error('untrusted Origin completed the WebSocket upgrade')))
    socket.once('error', reject)
  })
}

function nextMessage(socket: WebSocket, kind: string): Promise<ServerWireMessage> {
  return new Promise((resolve) => {
    const listener = (raw: WebSocket.RawData) => {
      const message = JSON.parse(String(raw)) as ServerWireMessage
      if (message.kind !== kind) return
      socket.off('message', listener)
      resolve(message)
    }
    socket.on('message', listener)
  })
}
