export type DraftStatus = 'draft' | 'reviewing' | 'published';
export interface DraftSection {
    id: string;
    heading: string;
    body: string;
    orderKey: string;
}
export interface DraftDocument {
    id: string;
    revision: number;
    title: string;
    status: DraftStatus;
    sections: DraftSection[];
    metadata: Record<string, unknown>;
}
export type DraftCommand = {
    type: 'draft.rename';
    title: string;
} | {
    type: 'section.add';
    sectionId: string;
    heading: string;
    after?: string;
} | {
    type: 'section.update';
    sectionId: string;
    patch: Partial<Pick<DraftSection, 'heading' | 'body'>>;
} | {
    type: 'section.move';
    sectionId: string;
    after?: string;
} | {
    type: 'section.delete';
    sectionId: string;
} | {
    type: 'draft.submitReview';
    expectedRevision: number;
};
export type DraftDomainEvent = {
    type: 'draft.replaced';
    draft: DraftDocument;
} | {
    type: 'draft.changed';
    draft: DraftDocument;
};
export interface DraftCommandResult {
    ok: boolean;
    revision: number;
    reason?: string;
}
export declare function initialDraft(id: string): DraftDocument;
export declare function applyDraftCommand(draft: DraftDocument, command: DraftCommand): DraftDocument;
//# sourceMappingURL=draft.d.ts.map