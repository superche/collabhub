import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CanonicalPatch, CollaborationOperation } from '@collabhub/protocol'
import { applyDraftPatches } from '../src/collab/draft-projection-adapter.js'
import { applyDraftCommand, initialDraft, type DraftCommand, type DraftDocument } from '../src/domain/draft.js'

export interface PersistedWalRecord {
  version: number
  operation: CollaborationOperation
  patches: CanonicalPatch[]
  committedAt: string
}

interface RepositoryData {
  drafts: Record<string, DraftDocument>
  wal: Record<string, PersistedWalRecord[]>
}

export class DraftRepository {
  private data: RepositoryData = { drafts: {}, wal: {} }
  private ready: Promise<void>
  constructor(private readonly file?: string) { this.ready = this.load() }

  async get(id: string): Promise<DraftDocument> {
    await this.ready
    const draft = this.data.drafts[id] ?? initialDraft(id)
    if (!this.data.drafts[id]) { this.data.drafts[id] = draft; await this.persist() }
    return structuredClone(draft)
  }

  async execute(id: string, command: DraftCommand): Promise<DraftDocument> {
    const next = applyDraftCommand(await this.get(id), command)
    this.data.drafts[id] = next
    await this.persist()
    return structuredClone(next)
  }

  async replace(id: string, draft: DraftDocument): Promise<void> {
    await this.ready
    this.data.drafts[id] = structuredClone(draft)
    await this.persist()
  }

  async appendCanonical(id: string, record: PersistedWalRecord): Promise<void> {
    const current = await this.get(id)
    const next = { ...applyDraftPatches(current, record.patches), revision: record.version }
    this.data.drafts[id] = next
    this.data.wal[id] = [...(this.data.wal[id] ?? []), structuredClone(record)]
    await this.persist()
  }

  async wal(id: string, afterVersion: number): Promise<PersistedWalRecord[]> {
    await this.ready
    return structuredClone((this.data.wal[id] ?? []).filter((record) => record.version > afterVersion))
  }

  private async load() {
    if (!this.file) return
    try { this.data = JSON.parse(await readFile(this.file, 'utf8')) as RepositoryData }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  private async persist() {
    if (!this.file) return
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    await writeFile(temporary, JSON.stringify(this.data, null, 2))
    await rename(temporary, this.file)
  }
}
