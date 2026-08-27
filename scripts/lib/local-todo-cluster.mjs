import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const infraFile = resolve(root, 'deploy/local-process-infra.yml')
const tsxCli = resolve(root, 'node_modules/tsx/dist/cli.mjs')
const viteCli = resolve(root, 'examples/todo-list-app/node_modules/vite/bin/vite.js')
const distributedEntry = resolve(root, 'examples/todo-list-app/server/distributed-node.ts')

const databaseUrl = 'postgres://collabhub:collabhub@127.0.0.1:55432/collabhub'
const redisUrl = 'redis://127.0.0.1:56379'
const internalToken = 'local-process-cluster-token'

function dockerCompose(...args) {
  return execFileSync('docker', ['compose', '-f', infraFile, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function attachLogs(name, child, log) {
  for (const [streamName, stream] of [['out', child.stdout], ['err', child.stderr]]) {
    const lines = createInterface({ input: stream })
    lines.on('line', (line) => {
      const entry = `[${name}:${streamName}] ${line}`
      log.push(entry)
      if (log.length > 500) log.shift()
      console.log(entry)
    })
  }
}

async function waitFor(url, timeoutMs = 20_000) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${url} returned ${response.status}`)
    } catch (error) { lastError = error }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`timed out waiting for ${url}: ${String(lastError)}`)
}

export async function startLocalTodoCluster({ startInfrastructure = true, startWeb = true } = {}) {
  if (startInfrastructure) dockerCompose('up', '-d', '--wait')
  const processes = new Map()
  const logs = []

  function startNode(name, role, port, internalUrl) {
    const child = spawn(process.execPath, [tsxCli, distributedEntry], {
      cwd: root,
      env: {
        ...process.env,
        COLLABHUB_ROLE: role,
        INSTANCE_ID: name,
        PORT: String(port),
        INTERNAL_URL: internalUrl,
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        INTERNAL_TOKEN: internalToken,
        ALLOW_INSECURE_IDENTITY: 'true',
        SNAPSHOT_INTERVAL: '2',
        OWNER_LEASE_SECONDS: '5',
        PG_POOL_MAX: '5',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    attachLogs(name, child, logs)
    processes.set(name, child)
    return child
  }

  function startWebClient(name, port, gatewayPort) {
    const child = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: resolve(root, 'examples/todo-list-app'),
      env: { ...process.env, VITE_COLLABHUB_WS_URL: `ws://127.0.0.1:${gatewayPort}/collab` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    attachLogs(name, child, logs)
    processes.set(name, child)
    return child
  }

  async function stopProcess(name) {
    const child = processes.get(name)
    if (!child || child.exitCode !== null) return
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }

  async function stop({ stopInfrastructure = startInfrastructure } = {}) {
    for (const name of [...processes.keys()].reverse()) await stopProcess(name)
    if (stopInfrastructure) dockerCompose('down', '-v')
  }

  try {
    startNode('todo-worker-1', 'worker', 7111, 'http://127.0.0.1:7111')
    startNode('todo-worker-2', 'worker', 7112, 'http://127.0.0.1:7112')
    await Promise.all([waitFor('http://127.0.0.1:7111/readyz'), waitFor('http://127.0.0.1:7112/readyz')])
    startNode('todo-gateway-1', 'gateway', 7011)
    startNode('todo-gateway-2', 'gateway', 7012)
    await Promise.all([waitFor('http://127.0.0.1:7011/readyz'), waitFor('http://127.0.0.1:7012/readyz')])
    if (startWeb) {
      startWebClient('todo-alice-web', 5273, 7011)
      startWebClient('todo-bob-web', 5274, 7012)
      await Promise.all([waitFor('http://127.0.0.1:5273'), waitFor('http://127.0.0.1:5274')])
    }
  } catch (error) {
    await stop()
    throw error
  }

  function ownerFor(tenantId, documentId) {
    const safeTenant = tenantId.replaceAll("'", "''")
    const safeDocument = documentId.replaceAll("'", "''")
    return dockerCompose('exec', '-T', 'postgres', 'psql', '-U', 'collabhub', '-d', 'collabhub', '-At', '-c',
      `SELECT owner_instance_id FROM collabhub_document_head WHERE tenant_id='${safeTenant}' AND document_id='${safeDocument}'`)
  }

  function databaseEvidence(tenantId, documentId) {
    const safeTenant = tenantId.replaceAll("'", "''")
    const safeDocument = documentId.replaceAll("'", "''")
    return dockerCompose('exec', '-T', 'postgres', 'psql', '-U', 'collabhub', '-d', 'collabhub', '-At', '-F', '|', '-c',
      `SELECT canonical_version,owner_epoch,owner_instance_id,snapshot_version,(SELECT count(*) FROM collabhub_operation_wal w WHERE w.tenant_id=h.tenant_id AND w.document_id=h.document_id),(SELECT count(*) FROM collabhub_operation_receipt r WHERE r.tenant_id=h.tenant_id AND r.document_id=h.document_id),(SELECT count(*) FROM collabhub_outbox o WHERE o.tenant_id=h.tenant_id AND o.document_id=h.document_id AND o.delivered_at IS NOT NULL) FROM collabhub_document_head h WHERE tenant_id='${safeTenant}' AND document_id='${safeDocument}'`)
  }

  const processEvidence = Object.fromEntries([...processes].map(([name, child]) => [name, child.pid]))
  console.log(JSON.stringify({ event: 'local_todo_cluster_ready', infrastructure: { postgres: 55432, redis: 56379 }, processes: processEvidence }))
  return { root, processes, processEvidence, logs, stopProcess, stop, ownerFor, databaseEvidence }
}
