import type { CanonicalPatch, CollaborationOperation } from '@collabhub/protocol';
import { type DraftCommand, type DraftDocument } from '../src/domain/draft.js';
export interface PersistedWalRecord {
    version: number;
    operation: CollaborationOperation;
    patches: CanonicalPatch[];
    committedAt: string;
}
export declare class DraftRepository {
    private readonly file?;
    private data;
    private ready;
    constructor(file?: string | undefined);
    get(id: string): Promise<DraftDocument>;
    execute(id: string, command: DraftCommand): Promise<DraftDocument>;
    replace(id: string, draft: DraftDocument): Promise<void>;
    appendCanonical(id: string, record: PersistedWalRecord): Promise<void>;
    wal(id: string, afterVersion: number): Promise<PersistedWalRecord[]>;
    private load;
    private persist;
}
//# sourceMappingURL=draft-repository.d.ts.map