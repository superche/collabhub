import { applyCanonicalPatches } from '@collabhub/domain-json';
export function applyDraftPatches(draft, patches) {
    const next = applyCanonicalPatches(draft, patches);
    return { ...next, sections: [...next.sections].sort((a, b) => Number(a.orderKey) - Number(b.orderKey)) };
}
//# sourceMappingURL=draft-projection-adapter.js.map