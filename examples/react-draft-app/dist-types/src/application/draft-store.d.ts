import type { DraftDocument, DraftDomainEvent } from '../domain/draft.js';
export declare class DraftStore {
    private current;
    private listeners;
    constructor(current: DraftDocument);
    getSnapshot: () => DraftDocument;
    subscribe: (listener: () => void) => () => boolean;
    publish(event: DraftDomainEvent): void;
}
//# sourceMappingURL=draft-store.d.ts.map