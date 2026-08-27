import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { applyCanonicalPatches, jsonStrategies } from '@collabhub/domain-json'
import { PROTOCOL_VERSION, type JsonObject, type ServerWireMessage } from '@collabhub/protocol'
import { defineDomainPack } from '@collabhub/strategy-sdk'
import { startStandaloneWebSocketServer, type StandaloneWebSocketServerHandle } from './index.js'

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

async function connect(url: string, actorId: string): Promise<WebSocket> {
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const ready = nextMessage(socket, 'ready')
  socket.send(JSON.stringify({
    kind: 'hello', protocolVersion: PROTOCOL_VERSION, tenantId: 'demo', documentId: 'document',
    actorId, clientId: `${actorId}-client`, lastKnownVersion: 0,
  }))
  await ready
  return socket
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
