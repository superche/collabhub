import type { DraftCommandTransport } from '../application/draft-command-bus.js'
import type { DraftCommand, DraftCommandResult, DraftDocument, DraftDomainEvent } from '../domain/draft.js'

export class RestDraftTransport implements DraftCommandTransport {
  private readonly listeners = new Set<(event: DraftDomainEvent) => void>()
  constructor(private readonly baseUrl: string, private readonly draftId: string) { void this.refresh() }

  async execute(command: DraftCommand): Promise<DraftCommandResult> {
    const response = await fetch(`${this.baseUrl}/api/drafts/${this.draftId}/commands`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
    })
    const body = await response.json() as { draft?: DraftDocument; revision?: number; reason?: string }
    if (body.draft) this.publish({ type: 'draft.changed', draft: body.draft })
    return { ok: response.ok, revision: body.draft?.revision ?? body.revision ?? 0, reason: body.reason }
  }
  subscribe(listener: (event: DraftDomainEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getConnectionState() { return 'online' as const }
  close() { this.listeners.clear() }
  async refresh() {
    const response = await fetch(`${this.baseUrl}/api/drafts/${this.draftId}`)
    if (!response.ok) throw new Error('unable to load draft')
    this.publish({ type: 'draft.replaced', draft: await response.json() as DraftDocument })
  }
  private publish(event: DraftDomainEvent) { for (const listener of this.listeners) listener(event) }
}
