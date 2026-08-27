import type { DraftCommandTransport } from '../application/draft-command-bus.js';
import type { DraftCommand, DraftCommandResult, DraftDomainEvent } from '../domain/draft.js';
export declare class RestDraftTransport implements DraftCommandTransport {
    private readonly baseUrl;
    private readonly draftId;
    private readonly listeners;
    constructor(baseUrl: string, draftId: string);
    execute(command: DraftCommand): Promise<DraftCommandResult>;
    subscribe(listener: (event: DraftDomainEvent) => void): () => boolean;
    getConnectionState(): "online";
    close(): void;
    refresh(): Promise<void>;
    private publish;
}
//# sourceMappingURL=rest-draft-transport.d.ts.map