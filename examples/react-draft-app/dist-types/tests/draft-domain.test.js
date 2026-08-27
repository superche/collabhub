import { describe, expect, it } from 'vitest';
import { applyDraftCommand, initialDraft } from '../src/domain/draft.js';
import { adaptDraftCommand } from '../src/collab/draft-command-adapter.js';
describe('classic draft domain baseline', () => {
    it('runs without CollabHub and preserves immutable structural sharing', () => {
        const initial = initialDraft('draft');
        const next = applyDraftCommand(initial, { type: 'section.update', sectionId: 'intro', patch: { body: 'Changed' } });
        expect(next).not.toBe(initial);
        expect(next.sections[1]).toBe(initial.sections[1]);
        expect(next.revision).toBe(1);
    });
    it('maps all commands at the narrow collaboration adapter boundary', () => {
        const draft = initialDraft('draft');
        expect(adaptDraftCommand({ type: 'draft.rename', title: 'New' }, draft).operationType).toBe('property.set');
        expect(adaptDraftCommand({ type: 'section.move', sectionId: 'plan' }, draft).strategyId).toBe('json.list-order');
        expect(adaptDraftCommand({ type: 'draft.submitReview', expectedRevision: 0 }, draft).strategyId).toBe('json.reject-if-stale');
    });
});
//# sourceMappingURL=draft-domain.test.js.map