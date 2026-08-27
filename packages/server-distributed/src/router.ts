import { createHash } from 'node:crypto'
import type { OwnerRecord, OwnershipCoordinator, RoomIdentity, WorkerRouter } from './types.js'

export class HttpWorkerRouter implements WorkerRouter {
  private readonly unhealthyUntil = new Map<string, number>()
  constructor(private readonly coordinator: OwnershipCoordinator, private readonly internalToken: string) {}

  async resolve(room: RoomIdentity): Promise<OwnerRecord> {
    const current = await this.coordinator.owner(room)
    if (current && (this.unhealthyUntil.get(current.instanceId) ?? 0) <= Date.now()) return current
    const workers = (await this.coordinator.listWorkers()).filter((worker) => (this.unhealthyUntil.get(worker.instanceId) ?? 0) <= Date.now())
    if (!workers.length) throw new Error('no room workers are ready')
    const selected = workers
      .map((worker) => ({ worker, score: this.score(room, worker.instanceId) }))
      .sort((a, b) => b.score.localeCompare(a.score))[0]!.worker
    const response = await fetch(`${selected.internalUrl}/internal/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-collabhub-internal-token': this.internalToken },
      body: JSON.stringify(room),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`worker activation failed (${response.status})`)
    const body = await response.json() as { owner: OwnerRecord }
    return body.owner
  }

  async invalidate(room: RoomIdentity, owner: OwnerRecord): Promise<void> {
    this.unhealthyUntil.set(owner.instanceId, Date.now() + 5000)
    await this.coordinator.releaseOwner(room, owner)
  }

  private score(room: RoomIdentity, workerId: string): string {
    return createHash('sha256').update(`${room.tenantId}\u0000${room.documentId}\u0000${workerId}`).digest('hex')
  }
}
