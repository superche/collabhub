import { hostname } from 'node:os'
import type { JsonObject } from '@collabhub/protocol'
import { jsonStrategies } from '@collabhub/domain-json'
import { defineDomainPack } from '@collabhub/strategy-sdk'
import { CollaborationGateway } from './gateway.js'
import { PostgresCommitStore } from './postgres-store.js'
import { RedisOwnershipCoordinator } from './redis-coordinator.js'
import { HttpWorkerRouter } from './router.js'
import { DistributedRoomWorker } from './worker.js'

const domainPack = defineDomainPack<JsonObject>({
  id: 'collabhub.distributed-json',
  schemaVersion: '1.0',
  strategies: jsonStrategies,
  initialState: (documentId) => ({
    id: documentId,
    title: 'CollabHub distributed document',
    status: 'draft',
    items: [],
    sections: [],
  }),
})

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`${name} is required`)
  return value
}

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

const role = required('COLLABHUB_ROLE', 'gateway')
const port = integer('PORT', role === 'worker' ? 7100 : 7000)
const instanceId = required('INSTANCE_ID', `${hostname()}-${role}-${port}`)
const databaseUrl = required('DATABASE_URL', 'postgres://collabhub:collabhub@127.0.0.1:5432/collabhub')
const redisUrl = required('REDIS_URL', 'redis://127.0.0.1:6379')
const internalToken = required('INTERNAL_TOKEN', 'local-development-token')
const store = new PostgresCommitStore<JsonObject>(databaseUrl, integer('PG_POOL_MAX', 10))
const coordinator = new RedisOwnershipCoordinator(redisUrl, integer('OWNER_LEASE_SECONDS', 10))
await coordinator.start()

let runtime: { start(): Promise<void>; close(): Promise<void> }
if (role === 'worker') {
  const internalUrl = required('INTERNAL_URL', `http://127.0.0.1:${port}`)
  runtime = new DistributedRoomWorker({
    instanceId, internalUrl, port, internalToken, store, coordinator, domainPack,
    snapshotInterval: integer('SNAPSHOT_INTERVAL', 100),
    maxRecoveryGap: integer('MAX_RECOVERY_GAP', 1000),
    maxMailbox: integer('MAX_ROOM_MAILBOX', 256),
    maxWarmRooms: integer('MAX_WARM_ROOMS', 1000),
    idleRoomMs: integer('IDLE_ROOM_MS', 60_000),
  })
} else if (role === 'gateway') {
  runtime = new CollaborationGateway({
    instanceId, port, internalToken, coordinator, store,
    router: new HttpWorkerRouter(coordinator, internalToken),
    maxBufferedBytes: integer('MAX_SOCKET_BUFFER_BYTES', 512 * 1024),
  })
} else {
  throw new Error(`COLLABHUB_ROLE must be gateway or worker, received ${role}`)
}

await runtime.start()
console.log(JSON.stringify({ level: 'info', message: 'CollabHub node ready', role, instanceId, port }))

const rssLimitBytes = integer('RSS_LIMIT_BYTES', 3 * 1024 * 1024 * 1024)
const rssTimer = setInterval(() => {
  const rss = process.memoryUsage().rss
  if (rss <= rssLimitBytes) return
  console.error(JSON.stringify({ level: 'fatal', message: 'RSS breaker opened', role, instanceId, rss, rssLimitBytes }))
  void stop('RSS_LIMIT')
}, 5000)
rssTimer.unref()

let stopping = false
async function stop(signal: string) {
  if (stopping) return
  stopping = true
  clearInterval(rssTimer)
  console.log(JSON.stringify({ level: 'info', message: 'CollabHub node stopping', signal, role, instanceId }))
  await runtime.close().catch(() => undefined)
  await Promise.all([store.close().catch(() => undefined), coordinator.close().catch(() => undefined)])
  process.exit(0)
}
process.on('SIGTERM', () => { void stop('SIGTERM') })
process.on('SIGINT', () => { void stop('SIGINT') })
