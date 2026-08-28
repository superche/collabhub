export interface DocumentState { id: string; title: string; wordCount: number }
export interface DocumentCommand { type: 'document.rename'; title: string }
export interface Diagnostics { connection: string; canonicalVersion: number; pendingCount: number }

export interface AppRuntime {
  getSnapshot(): DocumentState
  subscribe(listener: () => void): () => void
  getDiagnostics(): Diagnostics
  subscribeDiagnostics(listener: () => void): () => void
  execute(command: DocumentCommand): Promise<unknown>
  close(): void
}
