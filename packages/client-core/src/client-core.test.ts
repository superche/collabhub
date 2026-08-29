import { describe, expect, it } from 'vitest'
import type { ClientWireMessage, JsonObject, ServerWireMessage } from '@collabhub/protocol'
import { CollaborationClient, CollaborationStore, createCollaboration, json, type PendingOperationStorage, type PendingStorageMutation, type PersistedPendingOperation, type SocketLike } from './index.js'

class MemoryPendingStorage implements PendingOperationStorage {
  readonly values = new Map<string, readonly PersistedPendingOperation[]>()
  async load(key: string) { return this.values.get(key) ?? [] }
  async save(key: string, operations: readonly PersistedPendingOperation[]) {
    if (operations.length === 0) this.values.delete(key)
    else this.values.set(key, structuredClone(operations))
  }
  async mutate(key: string, mutation: PendingStorageMutation) {
    const remove = new Set(mutation.removeOperationIds ?? [])
    const merged = new Map((this.values.get(key) ?? [])
      .filter((entry) => !remove.has(entry.operation.operationId))
      .map((entry) => [entry.operation.operationId, structuredClone(entry)]))
    for (const entry of mutation.upsert ?? []) merged.set(entry.operation.operationId, structuredClone(entry))
    if (merged.size === 0) this.values.delete(key)
    else this.values.set(key, [...merged.values()])
  }
}

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
  helloAuthTokens: Array<string | undefined> = []
  submissions = 0
  submittedBaseVersions: number[] = []
  create = () => { const socket = new FakeSocket(this); this.connections.push(socket); return socket }
  receive(socket: FakeSocket, message: ClientWireMessage) {
    if (message.kind === 'hello') {
      this.helloAuthTokens.push(message.authToken)
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
  it('refreshes a short-lived token for every reconnect', async () => {
    const server = new FakeServer()
    let tokenSequence = 0
    const client = new CollaborationClient<JsonObject>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c', schemaVersion: '1.0',
      socketFactory: server.create, reconnectDelayMs: 5,
      getAuthToken: async () => `token-${++tokenSequence}`,
      applyPatches: (state) => state,
    })
    client.connect()
    await new Promise((resolve) => setTimeout(resolve, 1))
    server.connections[0]!.close()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(server.helloAuthTokens).toEqual(['token-1', 'token-2'])
    client.disconnect()
  })

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

  it('accepts ordinary application interfaces without a JsonObject intersection', () => {
    interface AppDocument { title: string; cards: Array<{ id: string; text: string }> }
    type AppCommand = { type: 'card.add'; card: { id: string; text: string } }
    const store = createCollaboration<AppDocument, AppCommand>({
      url: 'fake://', documentId: 'd', actorId: 'a', autoConnect: false,
      initialState: { title: 'Plain interface', cards: [] },
      command: (command) => json.create('cards', command.card.id, command.card),
    })
    expect(store.getSnapshot()).toEqual({ title: 'Plain interface', cards: [] })
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

  it('restores a durable pending operation after a page-like client restart', async () => {
    const storage = new MemoryPendingStorage()
    const offline = new CollaborationClient<JsonObject>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'old-client', schemaVersion: '1.0',
      socketFactory: () => { throw new Error('offline client must not connect') },
      pendingStorage: storage,
      applyPatches: (state) => state,
    })
    await offline.whenReady()
    void offline.submit({ operationId: 'durable-op', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: 'Recovered' } })
    await new Promise((resolve) => setTimeout(resolve, 1))
    expect(storage.values.size).toBe(1)

    const server = new FakeServer()
    const restarted = new CollaborationClient<JsonObject>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'new-client', schemaVersion: '1.0',
      socketFactory: server.create, pendingStorage: storage,
      applyPatches: (state, patches) => patches.reduce((next, patch) => patch.op === 'set' ? { ...next, [patch.path.slice(1)]: patch.value } : next, state),
    })
    restarted.connect()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(server.submissions).toBe(1)
    expect(restarted.diagnostics.pendingCount).toBe(0)
    expect(restarted.diagnostics.pendingPersistence).toBe('ready')
    expect(storage.values.size).toBe(0)
    restarted.disconnect()
  })

  it('atomically merges pending operations submitted by two tabs for the same actor', async () => {
    const storage = new MemoryPendingStorage()
    const createOfflineTab = (clientId: string) => new CollaborationClient<JsonObject>({
      url: 'fake://', tenantId: 't', documentId: 'd', actorId: 'same-user', clientId, schemaVersion: '1.0',
      socketFactory: () => { throw new Error('offline tab must not connect') }, pendingStorage: storage,
      applyPatches: (state) => state,
    })
    const first = createOfflineTab('tab-a')
    const second = createOfflineTab('tab-b')
    await Promise.all([first.whenReady(), second.whenReady()])

    void first.submit({ operationId: 'from-tab-a', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: 'A' } })
    void second.submit({ operationId: 'from-tab-b', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: 'B' } })
    await Promise.all([first.whenPendingPersisted(), second.whenPendingPersisted()])

    expect([...storage.values.values()][0]?.map((entry) => entry.operation.operationId).sort()).toEqual(['from-tab-a', 'from-tab-b'])
    first.disconnect()
    second.disconnect()
  })
})
