import { createHash } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import type { CanonicalEvent, JsonObject, OperationResult, SnapshotMessage } from '@collabhub/protocol'
import { applyCanonicalPatches } from '@collabhub/domain-json'
import type {
  CommitOutcome,
  CommitRequest,
  CommitStore,
  InternalRoomEvent,
  LoadedRoom,
  PersistedOperation,
  RoomIdentity,
  StoredReceipt,
} from './types.js'
import { stableStringify } from './identity.js'

const MIGRATION = `
CREATE TABLE IF NOT EXISTS collabhub_document_head (
  tenant_id text NOT NULL,
  document_id text NOT NULL,
  canonical_version bigint NOT NULL DEFAULT 0,
  owner_epoch bigint NOT NULL DEFAULT 0,
  owner_instance_id text,
  schema_version text NOT NULL,
  snapshot_version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id)
);

CREATE TABLE IF NOT EXISTS collabhub_snapshot (
  tenant_id text NOT NULL,
  document_id text NOT NULL,
  version bigint NOT NULL,
  schema_version text NOT NULL,
  state jsonb NOT NULL,
  checksum text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, version)
);

CREATE TABLE IF NOT EXISTS collabhub_operation_wal (
  tenant_id text NOT NULL,
  document_id text NOT NULL,
  version bigint NOT NULL,
  operation_id text NOT NULL,
  operation jsonb NOT NULL,
  patches jsonb NOT NULL,
  fingerprint text NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, version),
  UNIQUE (tenant_id, document_id, operation_id)
);

CREATE TABLE IF NOT EXISTS collabhub_operation_receipt (
  tenant_id text NOT NULL,
  document_id text NOT NULL,
  operation_id text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, operation_id)
);

CREATE TABLE IF NOT EXISTS collabhub_outbox (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  document_id text NOT NULL,
  canonical_version bigint NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  locked_by text,
  locked_until timestamptz
);

CREATE INDEX IF NOT EXISTS collabhub_outbox_pending_idx
  ON collabhub_outbox (id) WHERE delivered_at IS NULL;
`

function asNumber(value: string | number): number { return Number(value) }

export class PostgresCommitStore<TState extends JsonObject = JsonObject> implements CommitStore<TState> {
  private readonly pool: Pool

  constructor(connectionString: string, maxConnections = 10) {
    this.pool = new Pool({ connectionString, max: maxConnections, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
    this.pool.on('error', (error) => console.error(JSON.stringify({ level: 'error', message: 'idle PostgreSQL client failed', error: error.message })))
  }

  async migrate(): Promise<void> { await this.pool.query(MIGRATION) }

  async ensureDocument(room: RoomIdentity, schemaVersion: string, initialState: TState): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const inserted = await client.query(
        `INSERT INTO collabhub_document_head (tenant_id, document_id, schema_version)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING tenant_id`,
        [room.tenantId, room.documentId, schemaVersion],
      )
      if (inserted.rowCount) {
        await client.query(
          `INSERT INTO collabhub_snapshot (tenant_id, document_id, version, schema_version, state, checksum)
           VALUES ($1, $2, 0, $3, $4::jsonb, $5)`,
          [room.tenantId, room.documentId, schemaVersion, JSON.stringify(initialState), this.checksum(initialState)],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async claimOwnership(room: RoomIdentity, instanceId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE collabhub_document_head
       SET owner_epoch = owner_epoch + 1, owner_instance_id = $3, updated_at = now()
       WHERE tenant_id = $1 AND document_id = $2
       RETURNING owner_epoch`,
      [room.tenantId, room.documentId, instanceId],
    )
    if (!result.rowCount) throw new Error('document must be created before ownership is claimed')
    return asNumber(result.rows[0].owner_epoch)
  }

  async loadRoom(room: RoomIdentity): Promise<LoadedRoom<TState>> {
    const headResult = await this.pool.query(
      `SELECT canonical_version, owner_epoch, owner_instance_id, schema_version, snapshot_version
       FROM collabhub_document_head WHERE tenant_id = $1 AND document_id = $2`,
      [room.tenantId, room.documentId],
    )
    if (!headResult.rowCount) throw new Error('document does not exist')
    const head = headResult.rows[0]
    const snapshotResult = await this.pool.query(
      `SELECT state FROM collabhub_snapshot
       WHERE tenant_id = $1 AND document_id = $2 AND version = $3`,
      [room.tenantId, room.documentId, head.snapshot_version],
    )
    if (!snapshotResult.rowCount) throw new Error('document snapshot pointer is invalid')
    const walResult = await this.pool.query(
      `SELECT version, operation, patches, committed_at
       FROM collabhub_operation_wal
       WHERE tenant_id = $1 AND document_id = $2 AND version > $3
       ORDER BY version`,
      [room.tenantId, room.documentId, head.snapshot_version],
    )
    const wal: PersistedOperation[] = walResult.rows.map((row) => ({
      ...room,
      version: asNumber(row.version),
      operation: row.operation,
      patches: row.patches,
      committedAt: new Date(row.committed_at).toISOString(),
    }))
    return {
      ...room,
      schemaVersion: head.schema_version,
      version: asNumber(head.canonical_version),
      ownerEpoch: asNumber(head.owner_epoch),
      ownerInstanceId: head.owner_instance_id,
      snapshotVersion: asNumber(head.snapshot_version),
      state: snapshotResult.rows[0].state,
      wal,
    }
  }

  async lookupReceipt(room: RoomIdentity, operationId: string): Promise<StoredReceipt | undefined> {
    const result = await this.pool.query(
      `SELECT fingerprint, result FROM collabhub_operation_receipt
       WHERE tenant_id = $1 AND document_id = $2 AND operation_id = $3`,
      [room.tenantId, room.documentId, operationId],
    )
    return result.rowCount ? { fingerprint: result.rows[0].fingerprint, result: result.rows[0].result } : undefined
  }

  async recordReceipt(
    room: RoomIdentity,
    owner: { epoch: number; instanceId: string },
    fingerprint: string,
    result: OperationResult,
  ): Promise<'stored' | 'exists' | 'fenced'> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const head = await this.lockHead(client, room)
      if (asNumber(head.owner_epoch) !== owner.epoch || head.owner_instance_id !== owner.instanceId) {
        await client.query('ROLLBACK')
        return 'fenced'
      }
      const inserted = await client.query(
        `INSERT INTO collabhub_operation_receipt
           (tenant_id, document_id, operation_id, fingerprint, result)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT DO NOTHING RETURNING operation_id`,
        [room.tenantId, room.documentId, result.operationId, fingerprint, JSON.stringify(result)],
      )
      await client.query('COMMIT')
      return inserted.rowCount ? 'stored' : 'exists'
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async commit(request: CommitRequest): Promise<CommitOutcome> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const head = await this.lockHead(client, request)
      const canonicalVersion = asNumber(head.canonical_version)
      const prior = await client.query(
        `SELECT fingerprint, result FROM collabhub_operation_receipt
         WHERE tenant_id = $1 AND document_id = $2 AND operation_id = $3`,
        [request.tenantId, request.documentId, request.operation.operationId],
      )
      if (prior.rowCount) {
        await client.query('ROLLBACK')
        if (prior.rows[0].fingerprint !== request.fingerprint) return { kind: 'collision', canonicalVersion }
        const result = prior.rows[0].result as OperationResult
        return { kind: 'duplicate', result: result.kind === 'accepted' ? { ...result, duplicate: true } : result }
      }
      if (asNumber(head.owner_epoch) !== request.ownerEpoch || head.owner_instance_id !== request.ownerInstanceId) {
        await client.query('ROLLBACK')
        return { kind: 'fenced', canonicalVersion }
      }
      if (canonicalVersion !== request.resolvedAtVersion) {
        await client.query('ROLLBACK')
        return { kind: 'versionConflict', canonicalVersion }
      }
      const nextVersion = canonicalVersion + 1
      const result: Extract<OperationResult, { kind: 'accepted' }> = {
        kind: 'accepted', operationId: request.operation.operationId, canonicalVersion: nextVersion, patches: request.patches,
      }
      const event: CanonicalEvent = {
        kind: 'canonical', operationId: request.operation.operationId, actorId: request.operation.actorId,
        canonicalVersion: nextVersion, patches: request.patches,
      }
      await client.query(
        `INSERT INTO collabhub_operation_wal
           (tenant_id, document_id, version, operation_id, operation, patches, fingerprint)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
        [request.tenantId, request.documentId, nextVersion, request.operation.operationId, JSON.stringify(request.operation), JSON.stringify(request.patches), request.fingerprint],
      )
      await client.query(
        `INSERT INTO collabhub_operation_receipt
           (tenant_id, document_id, operation_id, fingerprint, result)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [request.tenantId, request.documentId, request.operation.operationId, request.fingerprint, JSON.stringify(result)],
      )
      await client.query(
        `INSERT INTO collabhub_outbox (tenant_id, document_id, canonical_version, event)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [request.tenantId, request.documentId, nextVersion, JSON.stringify({ tenantId: request.tenantId, documentId: request.documentId, event })],
      )
      await client.query(
        `UPDATE collabhub_document_head SET canonical_version = $3, updated_at = now()
         WHERE tenant_id = $1 AND document_id = $2`,
        [request.tenantId, request.documentId, nextVersion],
      )
      await client.query('COMMIT')
      return { kind: 'committed', result, event }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async saveSnapshot(room: RoomIdentity, version: number, schemaVersion: string, state: TState): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO collabhub_snapshot (tenant_id, document_id, version, schema_version, state, checksum)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT DO NOTHING`,
        [room.tenantId, room.documentId, version, schemaVersion, JSON.stringify(state), this.checksum(state)],
      )
      await client.query(
        `UPDATE collabhub_document_head SET snapshot_version = $3
         WHERE tenant_id = $1 AND document_id = $2
           AND canonical_version >= $3 AND snapshot_version < $3`,
        [room.tenantId, room.documentId, version],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async snapshot(room: RoomIdentity): Promise<SnapshotMessage<TState>> {
    const loaded = await this.loadRoom(room)
    const state = loaded.wal.reduce((current, entry) => applyCanonicalPatches(current, entry.patches), loaded.state)
    return {
      kind: 'snapshot', ...room, canonicalVersion: loaded.version, schemaVersion: loaded.schemaVersion,
      snapshot: state, snapshotRef: `pg://${encodeURIComponent(room.tenantId)}/${encodeURIComponent(room.documentId)}/${loaded.version}`,
    }
  }

  async eventsAfter(room: RoomIdentity, afterVersion: number, limit = 1000): Promise<CanonicalEvent[]> {
    const result = await this.pool.query(
      `SELECT version, operation_id, operation, patches FROM collabhub_operation_wal
       WHERE tenant_id = $1 AND document_id = $2 AND version > $3
       ORDER BY version LIMIT $4`,
      [room.tenantId, room.documentId, afterVersion, limit],
    )
    return result.rows.map((row) => ({
      kind: 'canonical', operationId: row.operation_id, actorId: row.operation.actorId,
      canonicalVersion: asNumber(row.version), patches: row.patches,
    }))
  }

  async headVersion(room: RoomIdentity): Promise<number> {
    const result = await this.pool.query(
      `SELECT canonical_version FROM collabhub_document_head WHERE tenant_id = $1 AND document_id = $2`,
      [room.tenantId, room.documentId],
    )
    return result.rowCount ? asNumber(result.rows[0].canonical_version) : 0
  }

  async claimOutbox(instanceId: string, limit: number): Promise<Array<{ id: string; event: InternalRoomEvent }>> {
    const result = await this.pool.query(
      `WITH claimed AS (
         SELECT id FROM collabhub_outbox
         WHERE delivered_at IS NULL AND (locked_until IS NULL OR locked_until < now())
         ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $2
       )
       UPDATE collabhub_outbox o
       SET locked_by = $1, locked_until = now() + interval '10 seconds'
       FROM claimed WHERE o.id = claimed.id
       RETURNING o.id, o.event`,
      [instanceId, limit],
    )
    return result.rows.map((row) => ({ id: String(row.id), event: row.event }))
  }

  async markOutboxDelivered(id: string): Promise<void> {
    await this.pool.query(`UPDATE collabhub_outbox SET delivered_at = now(), locked_by = NULL, locked_until = NULL WHERE id = $1`, [id])
  }

  async ping(): Promise<void> { await this.pool.query('SELECT 1') }
  async close(): Promise<void> { await this.pool.end() }

  private async lockHead(client: PoolClient, room: RoomIdentity) {
    const result = await client.query(
      `SELECT canonical_version, owner_epoch, owner_instance_id
       FROM collabhub_document_head WHERE tenant_id = $1 AND document_id = $2 FOR UPDATE`,
      [room.tenantId, room.documentId],
    )
    if (!result.rowCount) throw new Error('document does not exist')
    return result.rows[0]
  }

  private checksum(state: TState): string {
    return createHash('sha256').update(stableStringify(state)).digest('hex')
  }
}
