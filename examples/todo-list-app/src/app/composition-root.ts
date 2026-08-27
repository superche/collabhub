import { DraftCommandBus, type DraftCommandTransport } from '../application/draft-command-bus.js'
import type { DraftApplicationRuntime, RuntimeDiagnostics } from '../application/runtime.js'
import { DraftStore } from '../application/draft-store.js'
import { CollabHubDraftTransport } from '../collab/collabhub-draft-transport.js'
import { initialDraft } from '../domain/draft.js'
import { RestDraftTransport } from '../infrastructure/rest-draft-transport.js'

export function createDraftApplication(): DraftApplicationRuntime {
  const query = new URLSearchParams(location.search)
  const actor = query.get('client') ?? crypto.randomUUID().slice(0, 8)
  const draftId = query.get('draft') ?? 'launch-plan'
  const defaultOrigin = import.meta.env.DEV ? 'http://127.0.0.1:4100' : location.origin
  const defaultSocket = import.meta.env.DEV
    ? 'ws://127.0.0.1:4100/collab'
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`
  const collabUrl = query.get('collabUrl') ?? import.meta.env.VITE_COLLABHUB_WS_URL ?? defaultSocket
  const restBase = import.meta.env.VITE_DRAFT_API_URL ?? defaultOrigin
  const store = new DraftStore(initialDraft(draftId))
  let transport: DraftCommandTransport
  let unsubscribe: () => void = () => undefined
  let diagnosticsUnsubscribe: () => void = () => undefined
  const diagnosticsListeners = new Set<() => void>()

  const attach = (next: DraftCommandTransport) => {
    unsubscribe()
    diagnosticsUnsubscribe()
    transport = next
    unsubscribe = transport.subscribe((event) => store.publish(event))
    if (transport instanceof CollabHubDraftTransport) diagnosticsUnsubscribe = transport.subscribeDiagnostics(() => { for (const listener of diagnosticsListeners) listener() })
  }
  const make = (collab: boolean) => collab
    ? new CollabHubDraftTransport(collabUrl, actor, `${actor}-${crypto.randomUUID().slice(0, 6)}`, store)
    : new RestDraftTransport(restBase, draftId)
  attach(make(query.get('collab') !== '0'))
  const commandBus = new DraftCommandBus(transport!)

  return {
    store,
    commandBus,
    diagnostics(): RuntimeDiagnostics {
      if (transport instanceof CollabHubDraftTransport) {
        const value = transport.diagnostics()
        return {
          mode: 'collab', connection: value.connection, pendingCount: value.pendingCount, pendingBytes: value.pendingBytes,
          canonicalVersion: value.canonicalVersion, reconnectCount: value.reconnectCount, resyncCount: value.resyncCount,
          lastReject: value.lastReject ? `${value.lastReject.code}: ${value.lastReject.message}` : undefined,
          lastAckLatencyMs: value.lastAckLatencyMs,
        }
      }
      return { mode: 'rest', connection: 'online', pendingCount: 0, pendingBytes: 0, canonicalVersion: store.getSnapshot().revision, reconnectCount: 0, resyncCount: 0 }
    },
    subscribeDiagnostics(listener) { diagnosticsListeners.add(listener); return () => diagnosticsListeners.delete(listener) },
    setCollaboration(enabled) {
      transport.close()
      attach(make(enabled))
      commandBus.replaceTransport(transport)
      for (const listener of diagnosticsListeners) listener()
    },
  }
}
