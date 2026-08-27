import type { DraftDocument, DraftDomainEvent } from '../domain/draft.js'

export class DraftStore {
  private listeners = new Set<() => void>()
  constructor(private current: DraftDocument) {}
  getSnapshot = () => this.current
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  publish(event: DraftDomainEvent) { this.current = event.draft; for (const listener of this.listeners) listener() }
}
