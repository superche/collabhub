import { describe, expect, it } from 'vitest'
import type { ClientWireMessage, JsonObject, ServerWireMessage } from '@collabhub/protocol'
import { CollaborationClient, type SocketLike } from './index.js'

class FakeSocket implements SocketLike {
  readyState = 0
  private listeners = new Map<string, Array<(event: any) => void>>()
  constructor(private readonly server: FakeServer) { queueMicrotask(() => { this.readyState = 1; this.emit('open', {}) }) }
  addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: (event: any) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  send(data: string) { this.server.receive(this, JSON.parse(data) as ClientWireMessage) }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close', {}) }
  deliver(message: ServerWireMessage) { this.emit('message', { data: JSON.stringify(message) }) }
  private emit(type: string, event: any) { for (const listener of this.listeners.get(type) ?? []) listener(event) }
}

class FakeServer {
  connections: FakeSocket[] = []
  submissions = 0
  create = () => { const socket = new FakeSocket(this); this.connections.push(socket); return socket }
  receive(socket: FakeSocket, message: ClientWireMessage) {
    if (message.kind === 'hello') {
      socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 0, schemaVersion: '1.0', snapshotRef: 's0', snapshot: { title: 'Initial' } })
      socket.deliver({ kind: 'ready', canonicalVersion: 0 })
    }
    if (message.kind === 'submit') {
      this.submissions++
      socket.deliver({ kind: 'accepted', operationId: message.operation.operationId, canonicalVersion: 1, patches: [{ op: 'set', path: '/title', value: 'Recovered' }] })
    }
    if (message.kind === 'recover') socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 0, schemaVersion: '1.0', snapshotRef: 's0', snapshot: { title: 'Initial' } })
  }
}

describe('collaboration client recovery', () => {
  it('queues while disconnected, reconnects, replays once, and clears pending', async () => {
    const server = new FakeServer()
    const client = new CollaborationClient<JsonObject>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c', schemaVersion: '1.0',
      socketFactory: server.create, reconnectDelayMs: 5,
      applyPatches: (state, patches) => patches.reduce((next, patch) => patch.op === 'set' ? { ...next, [patch.path.slice(1)]: patch.value } : next, state),
    })
    client.connect()
    await new Promise((resolve) => setTimeout(resolve, 1))
    server.connections[0]!.close()
    const resultPromise = client.submit({ operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: 'Recovered' } }, [{ op: 'set', path: '/title', value: 'Recovered' }])
    expect(client.diagnostics.pendingCount).toBe(1)
    const result = await resultPromise
    expect(result.kind).toBe('accepted')
    expect(server.connections.length).toBe(2)
    expect(server.submissions).toBe(1)
    expect(client.state?.title).toBe('Recovered')
    expect(client.diagnostics.pendingCount).toBe(0)
    expect(client.diagnostics.reconnectCount).toBe(1)
    client.disconnect()
  })
})
