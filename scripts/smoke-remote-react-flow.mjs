import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const webSocketUrl = required('COLLABHUB_REMOTE_WS_URL')
const documentId = process.env.COLLABHUB_DOCUMENT_ID ?? `remote-react-flow-${Date.now().toString(36)}`
const tokens = new Map([
  ['alice', required('COLLABHUB_ALICE_TOKEN')],
  ['bob', required('COLLABHUB_BOB_TOKEN')],
])
const tokenPort = Number(process.env.COLLABHUB_TOKEN_PORT ?? 5290)
const tokenEndpoint = `http://127.0.0.1:${tokenPort}/token`
const outputVideo = process.env.COLLABHUB_RECORDING_VIDEO ?? resolve(root, 'output/playwright/react-flow-remote-e2e.mp4')
const outputPoster = process.env.COLLABHUB_RECORDING_POSTER ?? resolve(root, 'output/playwright/react-flow-remote-e2e-poster.jpg')
const children = []

const tokenServer = createServer(async (request, response) => {
  const origin = request.headers.origin
  if (origin === 'http://127.0.0.1:5193' || origin === 'http://127.0.0.1:5194') {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('access-control-allow-credentials', 'true')
    response.setHeader('vary', 'origin')
  }
  if (request.method === 'OPTIONS') {
    response.setHeader('access-control-allow-headers', 'content-type')
    response.setHeader('access-control-allow-methods', 'POST')
    response.writeHead(204).end()
    return
  }
  if (request.method !== 'POST' || request.url !== '/token') { response.writeHead(404).end(); return }
  const body = await readJson(request)
  if (body.documentId !== documentId || body.tenantId !== 'demo' || !tokens.has(body.actorId)) {
    response.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'document grant denied' }))
    return
  }
  response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    .end(JSON.stringify({ token: tokens.get(body.actorId) }))
})

try {
  await listen(tokenServer, tokenPort)
  children.push(startVite(5193), startVite(5194))
  await run(process.execPath, [resolve(root, 'scripts/record-react-flow-smoke.mjs')], {
    COLLABHUB_DOCUMENT_ID: documentId,
    COLLABHUB_RECORDING_VIDEO: outputVideo,
    COLLABHUB_RECORDING_POSTER: outputPoster,
  })
  console.log(JSON.stringify({ event: 'remote_react_flow_passed', webSocketUrl, documentId, outputVideo, outputPoster }))
} finally {
  for (const child of children) child.kill('SIGTERM')
  await new Promise((resolveClose) => tokenServer.close(() => resolveClose()))
}

function startVite(port) {
  return spawn('pnpm', ['--filter', '@collabhub/react-flow-app', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, VITE_COLLABHUB_WS_URL: webSocketUrl, VITE_COLLABHUB_TOKEN_ENDPOINT: tokenEndpoint },
    stdio: 'inherit',
  })
}

function run(command, args, extraEnvironment) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...extraEnvironment }, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)))
  })
}

function listen(server, port) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolveListen)
  })
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
