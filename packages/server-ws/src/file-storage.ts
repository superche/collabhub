import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { JsonObject } from '@collabhub/protocol'
import type { StorageAdapter, StoredSnapshot, WalRecord } from '@collabhub/server-core'

/** Durable single-process storage for the standalone Docker service. */
export class FileStorageAdapter<TState extends JsonObject = JsonObject> implements StorageAdapter<TState> {
  constructor(private readonly dataDirectory: string) {}

  async loadSnapshot(tenantId: string, documentId: string): Promise<StoredSnapshot<TState> | undefined> {
    return this.readJson<StoredSnapshot<TState>>(resolve(this.roomDirectory(tenantId, documentId), 'snapshot.json'))
  }

  async loadWal(tenantId: string, documentId: string, afterVersion: number): Promise<WalRecord[]> {
    try {
      const content = await readFile(resolve(this.roomDirectory(tenantId, documentId), 'wal.ndjson'), 'utf8')
      return content.split('\n').filter(Boolean).map((line) => JSON.parse(line) as WalRecord).filter((record) => record.version > afterVersion)
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
  }

  async appendWal(record: WalRecord): Promise<void> {
    const directory = this.roomDirectory(record.tenantId, record.documentId)
    await mkdir(directory, { recursive: true })
    await appendFile(resolve(directory, 'wal.ndjson'), `${JSON.stringify(record)}\n`, 'utf8')
  }

  async saveSnapshot(snapshot: StoredSnapshot<TState>): Promise<void> {
    const directory = this.roomDirectory(snapshot.tenantId, snapshot.documentId)
    await mkdir(directory, { recursive: true })
    const target = resolve(directory, 'snapshot.json')
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, 'utf8')
    await rename(temporary, target)
  }

  async deleteDocument(tenantId: string, documentId: string): Promise<void> {
    await rm(this.roomDirectory(tenantId, documentId), { recursive: true, force: true })
  }

  private roomDirectory(tenantId: string, documentId: string): string {
    return resolve(this.dataDirectory, Buffer.from(`${tenantId}\u0000${documentId}`).toString('base64url'))
  }

  private async readJson<T>(path: string): Promise<T | undefined> {
    try { return JSON.parse(await readFile(path, 'utf8')) as T }
    catch (error) { if (isMissing(error)) return undefined; throw error }
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
