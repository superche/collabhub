import type { CanonicalPatch } from '@collabhub/protocol';
import type { DraftCommand, DraftDocument } from '../domain/draft.js';
export interface AdaptedDraftOperation {
    operationType: string;
    strategyId: string;
    strategyVersion: string;
    payload: unknown;
    intent: DraftCommand;
    optimisticPatches: CanonicalPatch[];
}
export declare function adaptDraftCommand(command: DraftCommand, draft: DraftDocument): AdaptedDraftOperation;
//# sourceMappingURL=draft-command-adapter.d.ts.map