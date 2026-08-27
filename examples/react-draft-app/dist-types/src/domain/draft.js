export function initialDraft(id) {
    return {
        id, revision: 0, title: 'Quarterly launch draft', status: 'draft', metadata: {},
        sections: [
            { id: 'intro', heading: 'Introduction', body: 'Start writing together.', orderKey: '1024' },
            { id: 'plan', heading: 'Plan', body: 'Add milestones and owners.', orderKey: '2048' },
        ],
    };
}
export function applyDraftCommand(draft, command) {
    if (command.type === 'draft.rename')
        return { ...draft, title: command.title, revision: draft.revision + 1 };
    if (command.type === 'section.add') {
        if (draft.sections.some((section) => section.id === command.sectionId))
            throw new Error('section already exists');
        const ordered = [...draft.sections].sort((a, b) => Number(a.orderKey) - Number(b.orderKey));
        const index = command.after ? ordered.findIndex((section) => section.id === command.after) + 1 : 0;
        const left = index > 0 ? Number(ordered[index - 1]?.orderKey) : 0;
        const right = index < ordered.length ? Number(ordered[index]?.orderKey) : left + 2048;
        return { ...draft, revision: draft.revision + 1, sections: [...draft.sections, { id: command.sectionId, heading: command.heading, body: '', orderKey: String((left + right) / 2) }] };
    }
    if (command.type === 'section.update') {
        if (!draft.sections.some((section) => section.id === command.sectionId))
            throw new Error('section does not exist');
        return { ...draft, revision: draft.revision + 1, sections: draft.sections.map((section) => section.id === command.sectionId ? { ...section, ...command.patch } : section) };
    }
    if (command.type === 'section.move') {
        const moving = draft.sections.find((section) => section.id === command.sectionId);
        if (!moving)
            throw new Error('section does not exist');
        const ordered = draft.sections.filter((section) => section.id !== command.sectionId).sort((a, b) => Number(a.orderKey) - Number(b.orderKey));
        const index = command.after ? ordered.findIndex((section) => section.id === command.after) + 1 : 0;
        if (command.after && index === 0)
            throw new Error('after section does not exist');
        const left = index > 0 ? Number(ordered[index - 1]?.orderKey) : 0;
        const right = index < ordered.length ? Number(ordered[index]?.orderKey) : left + 2048;
        return { ...draft, revision: draft.revision + 1, sections: draft.sections.map((section) => section.id === command.sectionId ? { ...section, orderKey: String((left + right) / 2) } : section) };
    }
    if (command.type === 'section.delete') {
        if (!draft.sections.some((section) => section.id === command.sectionId))
            throw new Error('section does not exist');
        return { ...draft, revision: draft.revision + 1, sections: draft.sections.filter((section) => section.id !== command.sectionId) };
    }
    if (draft.revision !== command.expectedRevision)
        throw new Error('stale revision');
    if (draft.status !== 'draft')
        throw new Error('only a draft can enter review');
    return { ...draft, revision: draft.revision + 1, status: 'reviewing' };
}
//# sourceMappingURL=draft.js.map