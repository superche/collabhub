import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PostgresCommitStore } from '../packages/server-distributed/dist/postgres-store.js'
import { RedisOwnershipCoordinator } from '../packages/server-distributed/dist/redis-coordinator.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const composeFile = resolve(root, 'deploy/local/local-process-infra.yml')
const project = `collabhub-hardening-${process.pid}`
const room = { tenantId: 'hardening', documentId: `smoke-${randomUUID()}` }
const store = new PostgresCommitStore('postgres://collabhub:collabhub@127.0.0.1:55432/collabhub', 2)
const limiterA = new RedisOwnershipCoordinator('redis://127.0.0.1:56379')
const limiterB = new RedisOwnershipCoordinator('redis://127.0.0.1:56379')

function compose(...args) {
  return execFileSync('docker', ['compose', '-p', project, '-f', composeFile, ...args], { cwd: root, encoding: 'utf8' }).trim()
}

try {
  compose('up', '-d', '--wait')
  await Promise.all([limiterA.start(), limiterB.start()])
  const rateKey = `hardening-${randomUUID()}`
  const rateLimitEvidence = [
    await limiterA.consumeRateLimit(rateKey, 1, 2),
    await limiterB.consumeRateLimit(rateKey, 1, 2),
    await limiterA.consumeRateLimit(rateKey, 1, 2),
  ]
  if (rateLimitEvidence.join(',') !== 'true,true,false') throw new Error(`cluster rate limit mismatch: ${rateLimitEvidence}`)
  await store.migrate()
  await store.migrate()
  await store.ensureDocument(room, '1.0', { title: 'Initial' })
  const ownerEpoch = await store.claimOwnership(room, 'hardening-smoke')
  let state = { title: 'Initial' }
  for (let version = 1; version <= 5; version++) {
    state = { title: `Version ${version}` }
    const operationId = randomUUID()
    const operation = {
      ...room, actorId: 'smoke', clientId: 'smoke', operationId, baseVersion: version - 1,
      schemaVersion: '1.0', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0',
      payload: { path: '/title', value: state.title },
    }
    const result = await store.commit({
      ...room, ownerEpoch, ownerInstanceId: 'hardening-smoke', resolvedAtVersion: version - 1,
      operation, patches: [{ op: 'set', path: '/title', value: state.title }], fingerprint: `fingerprint-${version}`,
    })
    if (result.kind !== 'committed') throw new Error(`commit ${version} failed: ${result.kind}`)
    if (version === 2 || version === 4) await store.saveSnapshot(room, version, '1.0', state)
  }
  for (const item of await store.claimOutbox('hardening-smoke', 100)) await store.markOutboxDelivered(item.id)
  const migration = await store.migrateDocument({
    ...room, ownerEpoch, ownerInstanceId: 'hardening-smoke', version: 5,
    fromSchemaVersion: '1.0', toSchemaVersion: '2.0', state: { ...state, migrated: true },
    applied: [{ fromVersion: '1.0', toVersion: '2.0' }],
  })
  if (migration.kind !== 'migrated') throw new Error(`document migration failed: ${migration.kind}`)
  await new Promise((resolve) => setTimeout(resolve, 20))
  const compacted = await store.compact({ walVersions: 2, receiptTtlMs: 1, deliveredOutboxTtlMs: 1, snapshotsPerDocument: 2 })
  if (!compacted.acquired) throw new Error('compaction lock was unexpectedly busy')

  const recovered = await store.snapshot(room)
  const events = await store.eventsAfter(room, 3)
  if (recovered.canonicalVersion !== 5 || recovered.schemaVersion !== '2.0' || recovered.snapshot.title !== 'Version 5' || recovered.snapshot.migrated !== true) {
    throw new Error(`recovery mismatch: ${JSON.stringify(recovered)}`)
  }
  if (events.map((event) => event.canonicalVersion).join(',') !== '4,5') throw new Error(`retained WAL mismatch: ${JSON.stringify(events)}`)

  const databaseEvidence = compose(
    'exec', '-T', 'postgres', 'psql', '-U', 'collabhub', '-d', 'collabhub', '-At', '-F', '|', '-c',
    `SELECT h.canonical_version,h.schema_version,h.snapshot_version,` +
      `(SELECT count(*) FROM collabhub_operation_wal w WHERE w.tenant_id=h.tenant_id AND w.document_id=h.document_id),` +
      `(SELECT count(*) FROM collabhub_operation_receipt r WHERE r.tenant_id=h.tenant_id AND r.document_id=h.document_id),` +
      `(SELECT count(*) FROM collabhub_snapshot s WHERE s.tenant_id=h.tenant_id AND s.document_id=h.document_id),` +
      `(SELECT count(*) FROM collabhub_schema_history m WHERE m.tenant_id=h.tenant_id AND m.document_id=h.document_id),` +
      `(SELECT string_agg(version::text, ',' ORDER BY version) FROM collabhub_database_migration) ` +
      `FROM collabhub_document_head h WHERE tenant_id='${room.tenantId}' AND document_id='${room.documentId}'`,
  )
  if (databaseEvidence !== '5|2.0|5|2|0|2|1|1,2') throw new Error(`unexpected database evidence: ${databaseEvidence}`)
  console.log(JSON.stringify({ event: 'postgres_hardening_passed', room, migration, compacted, rateLimitEvidence, databaseEvidence, recoveredVersion: recovered.canonicalVersion }))
} finally {
  await Promise.all([limiterA.close().catch(() => undefined), limiterB.close().catch(() => undefined)])
  await store.close().catch(() => undefined)
  try { compose('down', '--volumes', '--remove-orphans') } catch { /* best-effort cleanup of the isolated smoke project */ }
}
