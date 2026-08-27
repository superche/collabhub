import type { DraftCommandBus } from './draft-command-bus.js'
import type { DraftStore } from './draft-store.js'

export interface RuntimeDiagnostics {
  mode: 'rest' | 'collab'
  connection: 'offline' | 'connecting' | 'online' | 'resyncing'
  pendingCount: number
  pendingBytes: number
  canonicalVersion: number
  reconnectCount: number
  resyncCount: number
  lastReject?: string
  lastAckLatencyMs?: number
}

export interface DraftApplicationRuntime {
  store: DraftStore
  commandBus: DraftCommandBus
  diagnostics(): RuntimeDiagnostics
  subscribeDiagnostics(listener: () => void): () => void
  setCollaboration(enabled: boolean): void
}
