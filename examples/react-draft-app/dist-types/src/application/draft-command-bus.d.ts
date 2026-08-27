import type { DraftCommand, DraftCommandResult, DraftDomainEvent } from '../domain/draft.js';
export interface DraftCommandTransport {
    execute(command: DraftCommand): Promise<DraftCommandResult>;
    subscribe(listener: (event: DraftDomainEvent) => void): () => void;
    getConnectionState(): 'offline' | 'connecting' | 'online' | 'resyncing';
    close(): void;
}
export declare class DraftCommandBus {
    private transport;
    constructor(transport: DraftCommandTransport);
    execute(command: DraftCommand): Promise<DraftCommandResult>;
    replaceTransport(transport: DraftCommandTransport): void;
    connectionState(): "offline" | "connecting" | "online" | "resyncing";
}
//# sourceMappingURL=draft-command-bus.d.ts.map