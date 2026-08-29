import { hostname } from 'node:os'
import { readFileSync } from 'node:fs'
import type { JsonObject } from '@collabhub/protocol'
import type { DomainPack } from '@collabhub/strategy-sdk'
import { CollaborationGateway } from './gateway.js'
import { PostgresCommitStore } from './postgres-store.js'
import { RedisOwnershipCoordinator } from './redis-coordinator.js'
import { HttpWorkerRouter } from './router.js'
import { DistributedRoomWorker } from './worker.js'
import { InsecureDevelopmentAuthAdapter, JwtGatewayAuthAdapter, type GatewayAuthAdapter } from './auth.js'

export interface DistributedNodeHandle {
  role: 'gateway' | 'worker'
  instanceId: string
  port: number
  stop(signal?: string): Promise<void>
}

export function requiredEnvironment(name: string, fallback?: string): string {
  const direct = process.env[name]
  const file = process.env[`${name}_FILE`]
  if (direct !== undefined && file !== undefined) throw new Error(`${name} and ${name}_FILE cannot both be set`)
  const value = file ? readFileSync(file, 'utf8').replace(/\r?\n$/, '') : direct ?? fallback
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function environmentWithDevelopmentFallback(name: string, developmentFallback: string): string {
  return requiredEnvironment(name, process.env.NODE_ENV === 'production' ? undefined : developmentFallback)
}

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

function nonNegativeInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function boolean(name: string, fallback = false): boolean {
  const value = process.env[name]
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be true or false`)
}

function gatewayAuth(): GatewayAuthAdapter {
  const jwksUrl = process.env.JWT_JWKS_URL
  if (jwksUrl) {
    return new JwtGatewayAuthAdapter({
      jwksUrl,
      issuer: requiredEnvironment('JWT_ISSUER'),
      audience: requiredEnvironment('JWT_AUDIENCE'),
      tenantClaim: process.env.JWT_TENANT_CLAIM,
      documentsClaim: process.env.JWT_DOCUMENTS_CLAIM,
    })
  }
  if (boolean('ALLOW_INSECURE_IDENTITY')) return new InsecureDevelopmentAuthAdapter()
  throw new Error('gateway requires JWT_JWKS_URL or explicit ALLOW_INSECURE_IDENTITY=true for local development')
}

export async function startDistributedNodeFromEnvironment<TState extends JsonObject>(domainPack: DomainPack<TState>): Promise<DistributedNodeHandle> {
  const production = process.env.NODE_ENV === 'production'
  const rawRole = requiredEnvironment('COLLABHUB_ROLE', 'gateway')
  if (rawRole !== 'gateway' && rawRole !== 'worker') throw new Error(`COLLABHUB_ROLE must be gateway or worker, received ${rawRole}`)
  const role = rawRole
  const port = integer('PORT', role === 'worker' ? 7100 : 7000)
  const instanceId = requiredEnvironment('INSTANCE_ID', `${hostname()}-${role}-${port}`)
  const databaseUrl = environmentWithDevelopmentFallback('DATABASE_URL', 'postgres://collabhub:collabhub@127.0.0.1:5432/collabhub')
  const redisUrl = environmentWithDevelopmentFallback('REDIS_URL', 'redis://127.0.0.1:6379')
  const internalToken = environmentWithDevelopmentFallback('INTERNAL_TOKEN', 'local-development-token')
  if (production && internalToken.length < 32) throw new Error('INTERNAL_TOKEN must be at least 32 characters in production')
  const store = new PostgresCommitStore<TState>(databaseUrl, integer('PG_POOL_MAX', 10))
  const coordinator = new RedisOwnershipCoordinator(redisUrl, integer('OWNER_LEASE_SECONDS', 10))
  await coordinator.start()

  const runtime = role === 'worker'
    ? new DistributedRoomWorker({
        instanceId, internalUrl: requiredEnvironment('INTERNAL_URL', `http://127.0.0.1:${port}`), port, internalToken, store, coordinator, domainPack,
        snapshotInterval: integer('SNAPSHOT_INTERVAL', 100),
        maxRecoveryGap: nonNegativeInteger('MAX_RECOVERY_GAP', 100),
        maxMailbox: integer('MAX_ROOM_MAILBOX', 256),
        roomCachePolicy: {
          maxWarmRooms: integer('MAX_WARM_ROOMS', 1000),
          idleTtlMs: integer('IDLE_ROOM_MS', 60_000),
          scanIntervalMs: integer('ROOM_CACHE_SCAN_INTERVAL_MS', 3000),
        },
        retentionPolicy: {
          walVersions: nonNegativeInteger('WAL_RETENTION_VERSIONS', 1000),
          receiptTtlMs: integer('RECEIPT_TTL_MS', 7 * 24 * 60 * 60 * 1000),
          deliveredOutboxTtlMs: integer('DELIVERED_OUTBOX_TTL_MS', 24 * 60 * 60 * 1000),
          snapshotsPerDocument: integer('SNAPSHOTS_PER_DOCUMENT', 3),
          compactionIntervalMs: integer('COMPACTION_INTERVAL_MS', 10 * 60 * 1000),
        },
        maxPayloadBytes: integer('MAX_PAYLOAD_BYTES', 128 * 1024),
      })
    : new CollaborationGateway({
        instanceId, port, internalToken, coordinator, store,
        auth: gatewayAuth(),
        router: new HttpWorkerRouter(coordinator, internalToken),
        maxBufferedBytes: integer('MAX_SOCKET_BUFFER_BYTES', 512 * 1024),
        maxConnections: integer('MAX_GATEWAY_CONNECTIONS', 10_000),
        maxConnectionsPerIp: integer('MAX_CONNECTIONS_PER_IP', 50),
        operationRatePerSecond: integer('OPERATION_RATE_PER_SECOND', 30),
        operationBurst: integer('OPERATION_BURST', 60),
        httpRatePerSecond: integer('HTTP_RATE_PER_SECOND', 20),
        httpBurst: integer('HTTP_BURST', 40),
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean),
        trustProxyHeaders: boolean('TRUST_PROXY_HEADERS'),
        maxPayloadBytes: integer('MAX_PAYLOAD_BYTES', 128 * 1024),
      })

  await runtime.start()
  console.log(JSON.stringify({ level: 'info', message: 'CollabHub node ready', role, instanceId, port, domainPack: domainPack.id }))

  const rssLimitBytes = integer('RSS_LIMIT_BYTES', 3 * 1024 * 1024 * 1024)
  let stopping = false
  const rssTimer = setInterval(() => {
    const rss = process.memoryUsage().rss
    if (rss <= rssLimitBytes) return
    console.error(JSON.stringify({ level: 'fatal', message: 'RSS breaker opened', role, instanceId, rss, rssLimitBytes }))
    void stop('RSS_LIMIT')
  }, 5000)
  rssTimer.unref()

  async function stop(signal = 'API'): Promise<void> {
    if (stopping) return
    stopping = true
    clearInterval(rssTimer)
    console.log(JSON.stringify({ level: 'info', message: 'CollabHub node stopping', signal, role, instanceId }))
    await runtime.close().catch(() => undefined)
    await Promise.all([store.close().catch(() => undefined), coordinator.close().catch(() => undefined)])
  }

  return { role, instanceId, port, stop }
}

export function installDistributedNodeSignalHandlers(handle: DistributedNodeHandle): void {
  const stop = (signal: string) => { void handle.stop(signal).finally(() => process.exit(0)) }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}
