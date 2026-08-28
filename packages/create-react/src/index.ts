import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

export function scaffoldReactApp(targetArgument: string, cwd = process.cwd()): string {
  const target = resolve(cwd, targetArgument)
  if (existsSync(target)) throw new Error(`Target already exists: ${target}`)
  const template = resolve(fileURLToPath(new URL('../template', import.meta.url)))
  cpSync(template, target, { recursive: true })
  const packagePath = resolve(target, 'package.json')
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string }
  manifest.name = packageName(basename(target))
  writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`)
  return target
}

function packageName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'collabhub-react-app'
}

export interface DoctorCheck { level: 'pass' | 'warn' | 'fail'; message: string }
export interface DoctorReport { ok: boolean; root: string; checks: DoctorCheck[] }

export function initExistingReactApp(targetArgument = '.', cwd = process.cwd()): string {
  const root = resolve(cwd, targetArgument)
  const packagePath = resolve(root, 'package.json')
  if (!existsSync(packagePath)) throw new Error(`No package.json found in ${root}`)
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as ProjectManifest
  if (!hasReact(manifest)) throw new Error('This command is for an existing React project (react dependency not found).')
  const sourceRoot = existsSync(resolve(root, 'src')) ? 'src' : 'app'
  const files: Record<string, string> = {
    'collabhub.model.ts': modelTemplate,
    [`${sourceRoot}/collab/collabhub.ts`]: clientTemplate,
    'server/collabhub.ts': serverTemplate,
    'Dockerfile.collabhub': dockerTemplate(sourceRoot),
    'collabhub/README.md': integrationTemplate(sourceRoot),
  }
  const collisions = Object.keys(files).filter((path) => existsSync(resolve(root, path)))
  if (collisions.length > 0) throw new Error(`CollabHub files already exist: ${collisions.join(', ')}`)
  for (const [path, contents] of Object.entries(files)) {
    const destination = resolve(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, contents)
  }
  manifest.dependencies = {
    ...manifest.dependencies,
    '@collabhub/client-core': '^0.2.0',
    '@collabhub/server-ws': '^0.2.0',
  }
  manifest.devDependencies = {
    ...manifest.devDependencies,
    '@collabhub/create-react': '^0.2.0',
    tsx: manifest.devDependencies?.tsx ?? '^4.20.5',
  }
  manifest.scripts = {
    ...manifest.scripts,
    'collabhub:server': 'tsx server/collabhub.ts',
    'collabhub:doctor': 'create-collabhub-react doctor .',
    'collabhub:verify': 'create-collabhub-react verify --model-id my-app',
  }
  writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`)
  return root
}

export function doctorProject(targetArgument = '.', cwd = process.cwd()): DoctorReport {
  const root = resolve(cwd, targetArgument)
  const checks: DoctorCheck[] = []
  const packagePath = resolve(root, 'package.json')
  if (!existsSync(packagePath)) return { ok: false, root, checks: [{ level: 'fail', message: 'package.json is missing' }] }
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as ProjectManifest
  checks.push(hasReact(manifest) ? pass('React project detected') : fail('react dependency is missing'))
  for (const dependency of ['@collabhub/client-core', '@collabhub/server-ws']) {
    const version = manifest.dependencies?.[dependency]
    checks.push(version ? pass(`${dependency} ${version}`) : fail(`${dependency} is missing`))
  }
  for (const path of ['collabhub.model.ts', 'server/collabhub.ts', 'Dockerfile.collabhub']) {
    checks.push(existsSync(resolve(root, path)) ? pass(`${path} found`) : fail(`${path} is missing`))
  }
  const sourceRoot = existsSync(resolve(root, 'src')) ? 'src' : 'app'
  checks.push(existsSync(resolve(root, sourceRoot, 'collab/collabhub.ts'))
    ? pass(`${sourceRoot}/collab/collabhub.ts found`)
    : fail(`${sourceRoot}/collab/collabhub.ts is missing`))
  checks.push(manifest.scripts?.['collabhub:server'] ? pass('collabhub:server script found') : fail('collabhub:server script is missing'))
  checks.push({ level: 'warn', message: 'Before production, replace development identity and configure WSS/authentication.' })
  return { ok: checks.every((check) => check.level !== 'fail'), root, checks }
}

interface ProjectManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}
function hasReact(manifest: ProjectManifest): boolean { return Boolean(manifest.dependencies?.react ?? manifest.devDependencies?.react) }
function pass(message: string): DoctorCheck { return { level: 'pass', message } }
function fail(message: string): DoctorCheck { return { level: 'fail', message } }

export interface VerifyTwoClientsOptions { url: string; modelId: string; authToken?: string; origin?: string; timeoutMs?: number }
export interface VerifyTwoClientsResult { ok: true; documentId: string; aliceVersion: number; bobVersion: number; linkedValue: number }

/** Real WebSocket smoke: two independent clients observe one server-computed linked update. */
export async function verifyTwoClients(options: VerifyTwoClientsOptions): Promise<VerifyTwoClientsResult> {
  const documentId = `verify-${Date.now().toString(36)}`
  const timeoutMs = options.timeoutMs ?? 8_000
  const alice = await VerificationClient.open(options.url, documentId, 'alice', options.modelId, options.authToken, options.origin, timeoutMs)
  const bob = await VerificationClient.open(options.url, documentId, 'bob', options.modelId, options.authToken, options.origin, timeoutMs)
  try {
    const result = await alice.submit({ type: 'collabhub.verify', value: 21 }, timeoutMs)
    if (result.kind !== 'accepted') throw new Error(`Alice operation was not accepted: ${JSON.stringify(result)}`)
    const bobEvent = await bob.waitForCanonical(result.operationId, timeoutMs)
    const linked = bobEvent.patches.find((patch: any) => patch.path === '/verificationLinked')?.value
    if (linked !== 42) throw new Error(`Bob received ${String(linked)} instead of linked value 42`)
    return { ok: true, documentId, aliceVersion: result.canonicalVersion, bobVersion: bobEvent.canonicalVersion, linkedValue: linked }
  } finally { alice.close(); bob.close() }
}

type WireMessage = any
class VerificationClient {
  private readonly messages: WireMessage[] = []
  private readonly waiters: Array<(message: WireMessage) => boolean> = []
  private sequence = 0
  private constructor(private readonly socket: any, private readonly documentId: string, private readonly actorId: string, private readonly modelId: string) {
    socket.addEventListener('message', (event: any) => {
      const message = JSON.parse(String(event.data))
      this.messages.push(message)
      for (const waiter of [...this.waiters]) waiter(message)
    })
  }
  static async open(url: string, documentId: string, actorId: string, modelId: string, authToken: string | undefined, origin: string | undefined, timeoutMs: number): Promise<VerificationClient> {
    const socket = new WebSocket(url, { origin: origin ?? 'http://127.0.0.1:5173' })
    const client = new VerificationClient(socket, documentId, actorId, modelId)
    await once(socket, 'open', timeoutMs)
    socket.send(JSON.stringify({ kind: 'hello', protocolVersion: '0.1', tenantId: 'default', documentId, actorId, clientId: `${actorId}-verify`, lastKnownVersion: 0, ...(authToken ? { authToken } : {}) }))
    await client.waitFor((message) => message.kind === 'ready', timeoutMs)
    return client
  }
  async submit(command: Record<string, unknown>, timeoutMs: number): Promise<WireMessage> {
    const operationId = `${this.actorId}-${Date.now().toString(36)}-${++this.sequence}`
    const ready = [...this.messages].reverse().find((message) => message.kind === 'ready')
    this.socket.send(JSON.stringify({ kind: 'submit', operation: { tenantId: 'default', documentId: this.documentId, actorId: this.actorId, clientId: `${this.actorId}-verify`, operationId, baseVersion: ready?.canonicalVersion ?? 0, schemaVersion: '1.0', operationType: 'model.command', strategyId: `${this.modelId}.commands`, strategyVersion: '1.0', payload: { command } } }))
    return await this.waitFor((message) => message.operationId === operationId && ['accepted', 'rejected', 'resyncRequired'].includes(message.kind), timeoutMs)
  }
  waitForCanonical(operationId: string, timeoutMs: number): Promise<WireMessage> { return this.waitFor((message) => message.kind === 'canonical' && message.operationId === operationId, timeoutMs) }
  close(): void { this.socket.close() }
  private waitFor(predicate: (message: WireMessage) => boolean, timeoutMs: number): Promise<WireMessage> {
    const existing = this.messages.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for CollabHub message')), timeoutMs)
      const waiter = (message: WireMessage) => {
        if (!predicate(message)) return false
        clearTimeout(timer)
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        resolve(message)
        return true
      }
      this.waiters.push(waiter)
    })
  }
}

function once(target: any, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for WebSocket ${event}`)), timeoutMs)
    target.addEventListener(event, () => { clearTimeout(timer); resolve() }, { once: true })
    target.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')) }, { once: true })
  })
}

const modelTemplate = `import { defineCollaborationModel } from '@collabhub/client-core'

export type AppDocument = { title: string; verification: number; verificationLinked: number }
export type AppCommand =
  | { type: 'title.changed'; title: string }
  | { type: 'collabhub.verify'; value: number }

export const collabModel = defineCollaborationModel<AppDocument, AppCommand>({
  id: 'my-app',
  initialState: () => ({ title: 'Shared document', verification: 0, verificationLinked: 0 }),
  reduce(draft, command) {
    if (command.type === 'title.changed') draft.title = command.title
    if (command.type === 'collabhub.verify') {
      draft.verification = command.value
      draft.verificationLinked = command.value * 2 // linked business logic syncs in the same change
    }
  },
  validate: (state) => state.title.trim() ? true : 'title cannot be empty',
})
`

const clientTemplate = `import { createModelCollaboration } from '@collabhub/client-core'
import { collabModel } from '../../collabhub.model'

export function createAppCollaboration(documentId: string, actorId: string) {
  return createModelCollaboration({
    url: import.meta.env.VITE_COLLABHUB_URL ?? 'ws://127.0.0.1:8787/collab',
    documentId,
    actorId,
    model: collabModel,
    initialState: collabModel.initialState(documentId),
    authToken: import.meta.env.VITE_COLLABHUB_AUTH_TOKEN,
  })
}
`

const serverTemplate = `import { FileStorageAdapter, startModelCollaborationServer } from '@collabhub/server-ws'
import { collabModel } from '../collabhub.model'

const authToken = process.env.COLLABHUB_AUTH_TOKEN
if (process.env.NODE_ENV === 'production' && !authToken) throw new Error('COLLABHUB_AUTH_TOKEN is required in production')
const allowedOrigins = process.env.COLLABHUB_ALLOWED_ORIGINS?.split(',').filter(Boolean)
if (process.env.NODE_ENV === 'production' && !allowedOrigins?.length) throw new Error('COLLABHUB_ALLOWED_ORIGINS is required in production')

const server = await startModelCollaborationServer({
  model: collabModel,
  storage: new FileStorageAdapter(process.env.COLLABHUB_DATA_DIR ?? '.collabhub-data'),
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  allowedOrigins: allowedOrigins ?? ['http://127.0.0.1:5173', 'http://localhost:5173'],
  allowInsecureDevelopmentIdentity: !authToken,
  authToken,
})
console.log('CollabHub listening on ' + server.webSocketUrl)
`

const dockerTemplate = (sourceRoot: string) => `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY collabhub.model.ts ./
COPY server ./server
COPY ${sourceRoot} ./${sourceRoot}
RUN addgroup -S -g 10001 collabhub && adduser -S -u 10001 -G collabhub collabhub \\
  && mkdir -p /data && chown -R collabhub:collabhub /app /data
USER 10001:10001
ENV NODE_ENV=production PORT=8787 COLLABHUB_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["npm", "run", "collabhub:server"]
`

const integrationTemplate = (sourceRoot: string) => `# CollabHub files

- Edit \`collabhub.model.ts\` to describe your document, commands, linked updates, and validation.
- Create the store with \`${sourceRoot}/collab/collabhub.ts\` in your composition root.
- React components call your existing command layer; use \`useSyncExternalStore(store.subscribe, store.getSnapshot)\` to read shared state.
- Run \`npm run collabhub:server\`, then \`npm run collabhub:verify\` for a real two-client WebSocket check.
- \`Dockerfile.collabhub\` is the service image. Configure production authentication before deploying it.
`
