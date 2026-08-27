import {
  PROTOCOL_VERSION,
  type CanonicalEvent,
  type CanonicalPatch,
  type ClientWireMessage,
  type CollaborationOperation,
  type JsonObject,
  type OperationResult,
  type PresenceMessage,
  type ServerWireMessage,
  type SnapshotMessage,
} from '@collabhub/protocol'

export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: (event: any) => void): void
}

export type SocketFactory = (url: string) => SocketLike

export interface ClientDiagnostics {
  connection: 'offline' | 'connecting' | 'online' | 'resyncing'
  pendingCount: number
  pendingBytes: number
  canonicalVersion: number
  lastReject?: { operationId: string; code: string; message: string }
  resyncCount: number
  reconnectCount: number
  lastAckLatencyMs?: number
}

interface PendingOperation {
  operation: CollaborationOperation
  optimisticPatches: CanonicalPatch[]
  bytes: number
  submittedAt: number
  sent: boolean
  resolve: (result: OperationResult) => void
}

export interface CollaborationClientOptions<TState extends JsonObject> {
  url: string
  tenantId: string
  documentId: string
  actorId: string
  clientId: string
  schemaVersion: string
  socketFactory?: SocketFactory
  applyPatches(state: TState, patches: readonly CanonicalPatch[]): TState
  maxPendingOperations?: number
  maxPendingBytes?: number
  reconnectDelayMs?: number
}

type StateListener<TState> = (state: Readonly<TState>) => void
type DiagnosticListener = (diagnostics: Readonly<ClientDiagnostics>) => void
type PresenceListener = (presence: PresenceMessage) => void

export class CollaborationClient<TState extends JsonObject> {
  private socket?: SocketLike
  private canonical?: TState
  private projected?: TState
  private pending: PendingOperation[] = []
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private manuallyClosed = false
  private operationSequence = 0
  private readonly stateListeners = new Set<StateListener<TState>>()
  private readonly diagnosticListeners = new Set<DiagnosticListener>()
  private readonly presenceListeners = new Set<PresenceListener>()
  private diagnosticsValue: ClientDiagnostics = {
    connection: 'offline', pendingCount: 0, pendingBytes: 0, canonicalVersion: 0, resyncCount: 0, reconnectCount: 0,
  }

  constructor(private readonly options: CollaborationClientOptions<TState>) {}

  get state(): Readonly<TState> | undefined { return this.projected }
  get canonicalVersion(): number { return this.diagnosticsValue.canonicalVersion }
  get diagnostics(): Readonly<ClientDiagnostics> { return this.diagnosticsValue }

  connect(): void {
    this.manuallyClosed = false
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return
    this.setDiagnostics({ connection: 'connecting' })
    const factory = this.options.socketFactory ?? ((url) => new WebSocket(url))
    const socket = factory(this.options.url)
    this.socket = socket
    socket.addEventListener('open', () => {
      if (socket !== this.socket) return
      this.send({
        kind: 'hello', protocolVersion: PROTOCOL_VERSION,
        tenantId: this.options.tenantId, documentId: this.options.documentId,
        actorId: this.options.actorId, clientId: this.options.clientId,
        lastKnownVersion: this.canonicalVersion,
      })
    })
    socket.addEventListener('message', (event) => {
      if (socket !== this.socket) return
      try { this.handle(JSON.parse(String(event.data)) as ServerWireMessage) }
      catch { this.setDiagnostics({ lastReject: { operationId: 'protocol', code: 'invalidMessage', message: 'server sent invalid JSON' } }) }
    })
    socket.addEventListener('close', () => {
      if (socket !== this.socket) return
      this.socket = undefined
      this.setDiagnostics({ connection: 'offline' })
      for (const item of this.pending) item.sent = false
      if (!this.manuallyClosed) this.scheduleReconnect()
    })
    socket.addEventListener('error', () => undefined)
  }

  disconnect(): void {
    this.manuallyClosed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.socket?.close()
    this.socket = undefined
    this.setDiagnostics({ connection: 'offline' })
  }

  submit(input: Omit<CollaborationOperation, 'tenantId' | 'documentId' | 'actorId' | 'clientId' | 'operationId' | 'baseVersion' | 'schemaVersion'> & { operationId?: string }, optimisticPatches: CanonicalPatch[] = []): Promise<OperationResult> {
    const operation: CollaborationOperation = {
      ...input,
      tenantId: this.options.tenantId,
      documentId: this.options.documentId,
      actorId: this.options.actorId,
      clientId: this.options.clientId,
      operationId: input.operationId ?? `${this.options.clientId}-${Date.now().toString(36)}-${++this.operationSequence}`,
      baseVersion: this.canonicalVersion,
      schemaVersion: this.options.schemaVersion,
    }
    const bytes = JSON.stringify(operation).length
    const pendingBytes = this.pending.reduce((sum, item) => sum + item.bytes, 0)
    if (this.pending.length >= (this.options.maxPendingOperations ?? 100) || pendingBytes + bytes > (this.options.maxPendingBytes ?? 256_000)) {
      return Promise.resolve({
        kind: 'rejected', operationId: operation.operationId, canonicalVersion: this.canonicalVersion,
        reason: { code: 'backpressure', message: 'pending operation limit exceeded' },
      })
    }
    return new Promise((resolve) => {
      this.pending.push({ operation, optimisticPatches, bytes, submittedAt: performance.now(), sent: false, resolve })
      this.reproject()
      this.flush()
    })
  }

  sendPresence(data: Record<string, unknown>): void {
    this.send({ kind: 'presence', documentId: this.options.documentId, actorId: this.options.actorId, clientId: this.options.clientId, data })
  }

  subscribe(listener: StateListener<TState>): () => void {
    this.stateListeners.add(listener)
    if (this.projected) listener(this.projected)
    return () => this.stateListeners.delete(listener)
  }
  subscribeDiagnostics(listener: DiagnosticListener): () => void {
    this.diagnosticListeners.add(listener)
    listener(this.diagnosticsValue)
    return () => this.diagnosticListeners.delete(listener)
  }
  subscribePresence(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  private handle(message: ServerWireMessage): void {
    if (message.kind === 'snapshot') return this.handleSnapshot(message as SnapshotMessage<TState>)
    if (message.kind === 'ready') {
      this.setDiagnostics({ connection: 'online', canonicalVersion: message.canonicalVersion })
      this.flush()
      return
    }
    if (message.kind === 'canonical') return this.handleCanonical(message)
    if (message.kind === 'presence') {
      for (const listener of this.presenceListeners) listener(message)
      return
    }
    this.handleResult(message)
  }

  private handleSnapshot(message: SnapshotMessage<TState>): void {
    this.canonical = message.snapshot
    this.setDiagnostics({ connection: 'online', canonicalVersion: message.canonicalVersion })
    for (const item of this.pending) {
      item.operation.baseVersion = message.canonicalVersion
      item.sent = false
    }
    this.reproject()
    this.flush()
  }

  private handleCanonical(event: CanonicalEvent): void {
    if (!this.canonical || event.canonicalVersion > this.canonicalVersion + 1) {
      this.requestRecovery('canonical version gap')
      return
    }
    if (event.canonicalVersion <= this.canonicalVersion) return
    this.canonical = this.options.applyPatches(this.canonical, event.patches)
    this.setDiagnostics({ canonicalVersion: event.canonicalVersion })
    this.reproject()
  }

  private handleResult(result: OperationResult): void {
    const index = this.pending.findIndex((item) => item.operation.operationId === result.operationId)
    const item = index >= 0 ? this.pending[index] : undefined
    if (result.kind === 'resyncRequired') {
      this.setDiagnostics({ connection: 'resyncing', resyncCount: this.diagnosticsValue.resyncCount + 1 })
      if (item) item.sent = false
      this.send({ kind: 'recover', tenantId: this.options.tenantId, documentId: this.options.documentId, sinceVersion: this.canonicalVersion })
      return
    }
    if (result.kind === 'accepted' && this.canonical && result.canonicalVersion === this.canonicalVersion + 1) {
      this.canonical = this.options.applyPatches(this.canonical, result.patches)
      this.setDiagnostics({ canonicalVersion: result.canonicalVersion })
    }
    if (item) {
      this.pending.splice(index, 1)
      item.resolve(result)
      this.setDiagnostics({ lastAckLatencyMs: Math.round((performance.now() - item.submittedAt) * 100) / 100 })
    }
    if (result.kind === 'rejected') {
      this.setDiagnostics({ lastReject: { operationId: result.operationId, code: result.reason.code, message: result.reason.message } })
    }
    this.reproject()
  }

  private requestRecovery(_reason: string) {
    this.setDiagnostics({ connection: 'resyncing', resyncCount: this.diagnosticsValue.resyncCount + 1 })
    this.send({ kind: 'recover', tenantId: this.options.tenantId, documentId: this.options.documentId, sinceVersion: this.canonicalVersion })
  }

  private reproject(): void {
    if (!this.canonical) return
    this.projected = this.pending.reduce((state, item) => this.options.applyPatches(state, item.optimisticPatches), this.canonical)
    for (const listener of this.stateListeners) listener(this.projected)
    this.setDiagnostics({ pendingCount: this.pending.length, pendingBytes: this.pending.reduce((sum, item) => sum + item.bytes, 0) })
  }

  private flush(): void {
    if (!this.socket || this.socket.readyState !== 1 || this.diagnosticsValue.connection !== 'online') return
    for (const item of this.pending) {
      if (item.sent) continue
      item.operation.baseVersion = this.canonicalVersion
      this.send({ kind: 'submit', operation: item.operation })
      item.sent = true
    }
  }

  private send(message: ClientWireMessage) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message))
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.setDiagnostics({ reconnectCount: this.diagnosticsValue.reconnectCount + 1 })
      this.connect()
    }, this.options.reconnectDelayMs ?? 300)
  }

  private setDiagnostics(patch: Partial<ClientDiagnostics>) {
    this.diagnosticsValue = { ...this.diagnosticsValue, ...patch }
    for (const listener of this.diagnosticListeners) listener(this.diagnosticsValue)
  }
}
