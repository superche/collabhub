import { describe, expect, it } from 'vitest'
import type { ClientWireMessage, JsonObject, ServerWireMessage } from '@collabhub/protocol'
import { CollaborationClient, CollaborationStore, createCollaboration, json, type SocketLike } from './index.js'

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
  submittedBaseVersions: number[] = []
  create = () => { const socket = new FakeSocket(this); this.connections.push(socket); return socket }
  receive(socket: FakeSocket, message: ClientWireMessage) {
    if (message.kind === 'hello') {
      socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 0, schemaVersion: '1.0', snapshotRef: 's0', snapshot: { title: 'Initial' } })
      socket.deliver({ kind: 'ready', canonicalVersion: 0 })
    }
    if (message.kind === 'submit') {
      this.submissions++
      this.submittedBaseVersions.push(message.operation.baseVersion)
      socket.deliver({ kind: 'accepted', operationId: message.operation.operationId, canonicalVersion: 1, patches: [{ op: 'set', path: '/title', value: 'Recovered' }] })
    }
    if (message.kind === 'recover') socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 0, schemaVersion: '1.0', snapshotRef: 's0', snapshot: { title: 'Initial' } })
  }
}

class ScriptedServer extends FakeServer {
  override receive(socket: FakeSocket, message: ClientWireMessage) {
    if (message.kind === 'hello') {
      socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 0, schemaVersion: '1.0', snapshotRef: 's0', snapshot: { title: 'Initial' } })
      socket.deliver({ kind: 'ready', canonicalVersion: 0 })
    }
    if (message.kind === 'submit') {
      this.submissions++
      this.submittedBaseVersions.push(message.operation.baseVersion)
      if (this.submissions === 1) socket.deliver({ kind: 'retryLater', operationId: message.operation.operationId, canonicalVersion: 0, retryAfterMs: 10, reason: 'ownerChanging' })
      else socket.deliver({ kind: 'accepted', operationId: message.operation.operationId, canonicalVersion: 2, patches: [{ op: 'set', path: '/title', value: 'Committed' }] })
    }
    if (message.kind === 'recover') socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 2, schemaVersion: '1.0', snapshotRef: 's2', snapshot: { title: 'Committed' } })
  }
}

class ResyncServer extends FakeServer {
  override receive(socket: FakeSocket, message: ClientWireMessage) {
    if (message.kind === 'hello') {
      socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 0, schemaVersion: '1.0', snapshotRef: 's0', snapshot: { title: 'Initial' } })
      socket.deliver({ kind: 'ready', canonicalVersion: 0 })
    }
    if (message.kind === 'submit') {
      this.submissions++
      this.submittedBaseVersions.push(message.operation.baseVersion)
      socket.deliver({ kind: 'resyncRequired', operationId: message.operation.operationId, canonicalVersion: 5, snapshotRef: 's5', reason: 'history unavailable' })
    }
    if (message.kind === 'recover') {
      socket.deliver({ kind: 'snapshot', tenantId: 't', documentId: 'd', canonicalVersion: 5, schemaVersion: '1.0', snapshotRef: 's5', snapshot: { title: 'Canonical' } })
    }
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

  it('exposes a React-compatible external store with application-owned commands', async () => {
    const server = new FakeServer()
    const store = new CollaborationStore<JsonObject, { type: 'rename'; title: string }>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c', schemaVersion: '1.0',
      initialState: { title: 'Loading' }, socketFactory: server.create,
      applyPatches: (state, patches) => patches.reduce((next, patch) => patch.op === 'set' ? { ...next, [patch.path.slice(1)]: patch.value } : next, state),
      adaptCommand: (command) => ({
        operation: { operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: command.title } },
        optimisticPatches: [{ op: 'set', path: '/title', value: command.title }],
      }),
    })
    let notifications = 0
    const unsubscribe = store.subscribe(() => { notifications++ })
    await new Promise((resolve) => setTimeout(resolve, 1))
    expect(store.getSnapshot().title).toBe('Initial')
    const result = await store.execute({ type: 'rename', title: 'Recovered' })
    expect(result.kind).toBe('accepted')
    expect(store.getSnapshot().title).toBe('Recovered')
    expect(store.diagnostics.pendingCount).toBe(0)
    expect(notifications).toBeGreaterThan(0)
    unsubscribe()
    store.close()
  })

  it('offers a two-concept React entry point with built-in JSON intents', async () => {
    const server = new FakeServer()
    const store = createCollaboration<JsonObject, { type: 'rename'; title: string }>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c',
      initialState: { title: 'Loading' }, socketFactory: server.create,
      command: (command) => json.set('/title', command.title),
    })
    await new Promise((resolve) => setTimeout(resolve, 1))
    expect(store.getSnapshot().title).toBe('Initial')
    const result = await store.execute({ type: 'rename', title: 'Recovered' })
    expect(result.kind).toBe('accepted')
    expect(store.getSnapshot().title).toBe('Recovered')
    expect(store.diagnostics.pendingCount).toBe(0)
    store.close()
  })

  it('keeps the same pending operation through retryLater and an accepted version gap', async () => {
    const server = new ScriptedServer()
    const client = new CollaborationClient<JsonObject>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c', schemaVersion: '1.0',
      socketFactory: server.create, reconnectDelayMs: 5,
      applyPatches: (state, patches) => patches.reduce((next, patch) => patch.op === 'set' ? { ...next, [patch.path.slice(1)]: patch.value } : next, state),
    })
    client.connect()
    await new Promise((resolve) => setTimeout(resolve, 1))
    const result = await client.submit({ operationId: 'stable-op', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: 'Committed' } })
    expect(result.kind).toBe('accepted')
    expect(result.operationId).toBe('stable-op')
    expect(server.submissions).toBe(2)
    expect(server.submittedBaseVersions).toEqual([0, 0])
    expect(client.canonicalVersion).toBe(2)
    expect(client.state?.title).toBe('Committed')
    expect(client.diagnostics.pendingCount).toBe(0)
    client.disconnect()
  })

  it('keeps baseVersion immutable and settles an unrebasable operation after snapshot recovery', async () => {
    const server = new ResyncServer()
    const client = new CollaborationClient<JsonObject>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c', schemaVersion: '1.0',
      socketFactory: server.create,
      applyPatches: (state) => state,
    })
    client.connect()
    await new Promise((resolve) => setTimeout(resolve, 1))
    const result = await client.submit({ operationId: 'stale-op', operationType: 'transaction.apply', strategyId: 'json.reject-if-stale', strategyVersion: '1.0', payload: { patches: [] } })
    expect(result.kind).toBe('resyncRequired')
    expect(server.submissions).toBe(1)
    expect(server.submittedBaseVersions).toEqual([0])
    expect(client.canonicalVersion).toBe(5)
    expect(client.state?.title).toBe('Canonical')
    expect(client.diagnostics.pendingCount).toBe(0)
    client.disconnect()
  })
})
