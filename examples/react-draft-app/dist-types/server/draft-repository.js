import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applyDraftPatches } from '../src/collab/draft-projection-adapter.js';
import { applyDraftCommand, initialDraft } from '../src/domain/draft.js';
export class DraftRepository {
    file;
    data = { drafts: {}, wal: {} };
    ready;
    constructor(file) {
        this.file = file;
        this.ready = this.load();
    }
    async get(id) {
        await this.ready;
        const draft = this.data.drafts[id] ?? initialDraft(id);
        if (!this.data.drafts[id]) {
            this.data.drafts[id] = draft;
            await this.persist();
        }
        return structuredClone(draft);
    }
    async execute(id, command) {
        const next = applyDraftCommand(await this.get(id), command);
        this.data.drafts[id] = next;
        await this.persist();
        return structuredClone(next);
    }
    async replace(id, draft) {
        await this.ready;
        this.data.drafts[id] = structuredClone(draft);
        await this.persist();
    }
    async appendCanonical(id, record) {
        const current = await this.get(id);
        const next = { ...applyDraftPatches(current, record.patches), revision: record.version };
        this.data.drafts[id] = next;
        this.data.wal[id] = [...(this.data.wal[id] ?? []), structuredClone(record)];
        await this.persist();
    }
    async wal(id, afterVersion) {
        await this.ready;
        return structuredClone((this.data.wal[id] ?? []).filter((record) => record.version > afterVersion));
    }
    async load() {
        if (!this.file)
            return;
        try {
            this.data = JSON.parse(await readFile(this.file, 'utf8'));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    async persist() {
        if (!this.file)
            return;
        await mkdir(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        await writeFile(temporary, JSON.stringify(this.data, null, 2));
        await rename(temporary, this.file);
    }
}
//# sourceMappingURL=draft-repository.js.map