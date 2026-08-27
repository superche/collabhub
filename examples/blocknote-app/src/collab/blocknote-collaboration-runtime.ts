import type { Block } from '@blocknote/core'
import { cloneJson, jsonFingerprint } from '../application/json-fingerprint.js'
import type { BlockChangeHint, BlockNoteApplicationRuntime, BlockNoteRuntimeDiagnostics } from '../application/runtime.js'
import type { BlockCommand, BlockDocument } from '../domain/block-document.js'
import { documentToBlockNoteBlocks } from './block-projection-adapter.js'
import { diffBlockNoteDocuments } from './blocknote-change-adapter.js'
import { CollabHubBlockTransport } from './collabhub-block-transport.js'

const UPDATE_COALESCE_MS = 180

export class BlockNoteCollaborationRuntime implements BlockNoteApplicationRuntime {
  readonly initialBlocks: Block[]
  private localBlocks: Block[]
  private latestDocument: BlockDocument
  private outstanding = 0
  private readonly updateTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly dirtyUpdates = new Map<string, Record<string, unknown>>()
  private readonly blockListeners = new Set<(blocks: readonly Block[]) => void>()
  private readonly diagnosticListeners = new Set<() => void>()
  private readonly submittedByType: Record<string, number> = {}
  private submittedOperations = 0
  private lastOperation?: string
  private readonly unsubscribeDocument: () => void
  private readonly unsubscribeDiagnostics: () => void

  constructor(readonly actorId: string, private readonly transport: CollabHubBlockTransport) {
    this.latestDocument = transport.document
    this.initialBlocks = documentToBlockNoteBlocks(this.latestDocument)
    this.localBlocks = this.initialBlocks
    this.unsubscribeDocument = transport.subscribeDocument((document) => {
      this.latestDocument = document
      if (this.outstanding === 0 && this.dirtyUpdates.size === 0) {
        this.localBlocks = documentToBlockNoteBlocks(document)
        this.publishBlocks()
      }
    })
    this.unsubscribeDiagnostics = transport.subscribeDiagnostics(() => this.publishDiagnostics())
  }

  handleEditorChange(blocks: readonly Block[], changes: readonly BlockChangeHint[] = []): void {
    if (changes.length > 0 && changes.every((change) => change.type === 'update')) {
      const changedRoots = new Set<string>()
      for (const change of changes) {
        const root = blocks.find((block) => containsBlock(block, change.blockId))
        if (root) changedRoots.add(root.id)
      }
      if (changedRoots.size > 0) {
        const previousById = new Map(this.localBlocks.map((block) => [block.id, block]))
        const changedBlocks = new Map<string, Block>()
        this.localBlocks = blocks.map((block) => changedRoots.has(block.id)
          ? cloneJson(block)
          : previousById.get(block.id) ?? cloneJson(block))
        for (const id of changedRoots) {
          const block = this.localBlocks.find((candidate) => candidate.id === id)
          if (block && jsonFingerprint(previousById.get(id)) !== jsonFingerprint(block)) changedBlocks.set(id, block)
        }
        for (const block of changedBlocks.values()) {
          this.scheduleUpdate({ type: 'block.update', block: cloneJson(block) as unknown as Record<string, unknown> })
        }
        return
      }
    }
    const next = blocks.map(cloneJson)
    const commands = diffBlockNoteDocuments(this.localBlocks, next)
    this.localBlocks = next
    for (const command of commands) {
      if (command.type === 'block.update') this.scheduleUpdate(command)
      else {
        const id = command.type === 'block.insert' ? String(command.block.id) : command.blockId
        if (command.type === 'block.delete') this.cancelUpdate(id)
        this.dispatch(command)
      }
    }
  }

  subscribeBlocks(listener: (blocks: readonly Block[]) => void) {
    this.blockListeners.add(listener)
    listener(this.localBlocks)
    return () => this.blockListeners.delete(listener)
  }

  diagnostics(): Readonly<BlockNoteRuntimeDiagnostics> {
    return { ...this.transport.diagnostics, submittedOperations: this.submittedOperations, submittedByType: { ...this.submittedByType }, lastOperation: this.lastOperation }
  }
  subscribeDiagnostics(listener: () => void) {
    this.diagnosticListeners.add(listener)
    listener()
    return () => this.diagnosticListeners.delete(listener)
  }

  close(): void {
    for (const timer of this.updateTimers.values()) clearTimeout(timer)
    this.updateTimers.clear()
    this.unsubscribeDocument()
    this.unsubscribeDiagnostics()
    this.transport.close()
  }

  private scheduleUpdate(command: Extract<BlockCommand, { type: 'block.update' }>) {
    const id = String(command.block.id)
    this.dirtyUpdates.set(id, command.block)
    this.cancelTimer(id)
    this.updateTimers.set(id, setTimeout(() => {
      this.updateTimers.delete(id)
      const block = this.dirtyUpdates.get(id)
      if (!block) return
      this.dispatch({ type: 'block.update', block }, () => {
        if (jsonFingerprint(this.dirtyUpdates.get(id)) === jsonFingerprint(block)) this.dirtyUpdates.delete(id)
      })
    }, UPDATE_COALESCE_MS))
  }

  private cancelUpdate(id: string) {
    this.cancelTimer(id)
    this.dirtyUpdates.delete(id)
  }
  private cancelTimer(id: string) {
    const timer = this.updateTimers.get(id)
    if (timer) clearTimeout(timer)
    this.updateTimers.delete(id)
  }

  private dispatch(command: BlockCommand, beforeSettle: () => void = () => undefined) {
    this.outstanding += 1
    this.submittedOperations += 1
    this.submittedByType[command.type] = (this.submittedByType[command.type] ?? 0) + 1
    this.lastOperation = command.type
    this.publishDiagnostics()
    void this.transport.execute(command).then((result) => {
      if (!result.ok) this.lastOperation = `${command.type} rejected: ${result.reason ?? 'unknown'}`
    }).catch((error) => {
      this.lastOperation = `${command.type} failed: ${error instanceof Error ? error.message : String(error)}`
    }).finally(() => {
      beforeSettle()
      this.outstanding -= 1
      if (this.outstanding === 0 && this.dirtyUpdates.size === 0) {
        this.localBlocks = documentToBlockNoteBlocks(this.latestDocument)
        this.publishBlocks()
      }
      this.publishDiagnostics()
    })
  }

  private publishBlocks() { for (const listener of this.blockListeners) listener(this.localBlocks) }
  private publishDiagnostics() { for (const listener of this.diagnosticListeners) listener() }
}

function containsBlock(block: Block, id: string): boolean {
  return block.id === id || block.children.some((child) => containsBlock(child, id))
}
