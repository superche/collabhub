import { jsonStrategies } from '@collabhub/domain-json';
import { defineDomainPack } from '@collabhub/strategy-sdk';
import { initialDraft } from '../src/domain/draft.js';
export const DraftDomainPack = defineDomainPack({
    id: 'example.draft',
    schemaVersion: '1.0',
    strategies: jsonStrategies,
    invariants: [{
            id: 'draft.unique-section-id',
            check(state) {
                const draft = state;
                const ids = draft.sections.map((section) => section.id);
                return new Set(ids).size === ids.length || 'section ids must be unique';
            },
        }, {
            id: 'draft.valid-status',
            check(state) {
                return ['draft', 'reviewing', 'published'].includes(String(state.status)) || 'invalid draft status';
            },
        }],
    initialState(documentId) { return initialDraft(documentId); },
});
//# sourceMappingURL=draft-domain-pack.js.map