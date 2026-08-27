import type { DraftCommand, DraftCommandResult, DraftDomainEvent } from '../domain/draft.js'

export interface DraftCommandTransport {
  execute(command: DraftCommand): Promise<DraftCommandResult>
  subscribe(listener: (event: DraftDomainEvent) => void): () => void
  getConnectionState(): 'offline' | 'connecting' | 'online' | 'resyncing'
  close(): void
}

export class DraftCommandBus {
  constructor(private transport: DraftCommandTransport) {}
  execute(command: DraftCommand) { return this.transport.execute(command) }
  replaceTransport(transport: DraftCommandTransport) { this.transport.close(); this.transport = transport }
  connectionState() { return this.transport.getConnectionState() }
}
