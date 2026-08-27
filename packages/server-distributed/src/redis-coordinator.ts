import { createClient, type RedisClientType } from 'redis'
import { roomKey } from '@collabhub/protocol'
import type { InternalRoomEvent, OwnerRecord, OwnershipCoordinator, RoomIdentity } from './types.js'

const EVENT_CHANNEL = 'collabhub:canonical'
const PRESENCE_CHANNEL = 'collabhub:presence'

export class RedisOwnershipCoordinator implements OwnershipCoordinator {
  private readonly client: RedisClientType
  private readonly subscriber: RedisClientType
  private readonly leaseSeconds: number

  constructor(url: string, leaseSeconds = 10) {
    this.client = createClient({ url }) as RedisClientType
    this.subscriber = this.client.duplicate() as RedisClientType
    this.client.on('error', (error) => console.error(JSON.stringify({ level: 'error', message: 'Redis command connection failed', error: error.message })))
    this.subscriber.on('error', (error) => console.error(JSON.stringify({ level: 'error', message: 'Redis subscriber failed', error: error.message })))
    this.leaseSeconds = leaseSeconds
  }

  async start(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect()
    if (!this.subscriber.isOpen) await this.subscriber.connect()
  }

  async registerWorker(instanceId: string, internalUrl: string): Promise<() => Promise<void>> {
    const key = this.workerKey(instanceId)
    const heartbeat = async () => { await this.client.set(key, internalUrl, { EX: this.leaseSeconds }) }
    await heartbeat()
    const timer = setInterval(() => { void heartbeat().catch(() => undefined) }, Math.max(1000, this.leaseSeconds * 300))
    timer.unref()
    return async () => {
      clearInterval(timer)
      const current = await this.client.get(key)
      if (current === internalUrl) await this.client.del(key)
    }
  }

  async listWorkers(): Promise<Array<{ instanceId: string; internalUrl: string }>> {
    const found: Array<{ instanceId: string; internalUrl: string }> = []
    for await (const keys of this.client.scanIterator({ MATCH: 'collabhub:worker:*', COUNT: 100 })) {
      for (const key of keys) {
        const internalUrl = await this.client.get(key)
        if (internalUrl) found.push({ instanceId: key.slice('collabhub:worker:'.length), internalUrl })
      }
    }
    return found.sort((a, b) => a.instanceId.localeCompare(b.instanceId))
  }

  async owner(room: RoomIdentity): Promise<OwnerRecord | undefined> {
    const raw = await this.client.get(this.ownerKey(room))
    if (!raw) return undefined
    try { return JSON.parse(raw) as OwnerRecord } catch { return undefined }
  }

  async publishOwner(room: RoomIdentity, owner: OwnerRecord): Promise<void> {
    await this.client.set(this.ownerKey(room), JSON.stringify(owner), { EX: this.leaseSeconds })
  }

  async renewOwner(room: RoomIdentity, owner: OwnerRecord): Promise<boolean> {
    const result = await this.client.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end`,
      { keys: [this.ownerKey(room)], arguments: [JSON.stringify(owner), String(this.leaseSeconds)] },
    )
    return Number(result) === 1
  }

  async releaseOwner(room: RoomIdentity, owner: OwnerRecord): Promise<void> {
    await this.client.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
      { keys: [this.ownerKey(room)], arguments: [JSON.stringify(owner)] },
    )
  }

  async publishEvent(event: InternalRoomEvent): Promise<void> {
    await this.client.publish(EVENT_CHANNEL, JSON.stringify(event))
  }

  async publishPresence(message: Record<string, unknown>): Promise<void> {
    await this.client.publish(PRESENCE_CHANNEL, JSON.stringify(message))
  }

  async subscribe(
    onEvent: (event: InternalRoomEvent) => void,
    onPresence: (message: Record<string, unknown>) => void,
  ): Promise<() => Promise<void>> {
    await this.subscriber.subscribe(EVENT_CHANNEL, (raw) => {
      try { onEvent(JSON.parse(raw) as InternalRoomEvent) } catch { /* invalid internal message */ }
    })
    await this.subscriber.subscribe(PRESENCE_CHANNEL, (raw) => {
      try { onPresence(JSON.parse(raw) as Record<string, unknown>) } catch { /* invalid internal message */ }
    })
    return async () => {
      await this.subscriber.unsubscribe(EVENT_CHANNEL)
      await this.subscriber.unsubscribe(PRESENCE_CHANNEL)
    }
  }

  async ping(): Promise<void> { await this.client.ping() }

  async close(): Promise<void> {
    if (this.subscriber.isOpen) await this.subscriber.quit()
    if (this.client.isOpen) await this.client.quit()
  }

  private ownerKey(room: RoomIdentity): string { return `collabhub:owner:${roomKey(room.tenantId, room.documentId)}` }
  private workerKey(instanceId: string): string { return `collabhub:worker:${instanceId}` }
}
