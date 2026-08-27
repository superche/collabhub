import { type ClientDiagnostics } from '@collabhub/client-core';
import type { DraftCommandTransport } from '../application/draft-command-bus.js';
import type { DraftStore } from '../application/draft-store.js';
import type { DraftCommand, DraftCommandResult, DraftDomainEvent } from '../domain/draft.js';
export declare class CollabHubDraftTransport implements DraftCommandTransport {
    private readonly store;
    private readonly client;
    private readonly listeners;
    private diagnosticsValue;
    private readonly onOffline;
    private readonly onOnline;
    constructor(url: string, actorId: string, clientId: string, store: DraftStore);
    execute(command: DraftCommand): Promise<DraftCommandResult>;
    subscribe(listener: (event: DraftDomainEvent) => void): () => boolean;
    getConnectionState(): "offline" | "connecting" | "online" | "resyncing";
    close(): void;
    diagnostics(): Readonly<ClientDiagnostics>;
    subscribeDiagnostics(listener: () => void): () => void;
    sendPresence(data: Record<string, unknown>): void;
    private publish;
}
//# sourceMappingURL=collabhub-draft-transport.d.ts.map