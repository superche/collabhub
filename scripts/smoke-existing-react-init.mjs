import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(resolve(tmpdir(), 'collabhub-existing-react-'))
const app = resolve(scratch, 'existing-app')
const archives = resolve(scratch, 'archives')
let server

try {
  mkdirSync(resolve(app, 'src'), { recursive: true })
  mkdirSync(archives, { recursive: true })
  writeFileSync(resolve(app, 'package.json'), JSON.stringify({
    name: 'existing-app', private: true, type: 'module',
    scripts: { build: 'tsc --noEmit' },
    dependencies: { react: '^19.1.1', 'react-dom': '^19.1.1' },
    devDependencies: { '@types/node': '^24.3.0', '@types/react': '^19.1.12', '@types/react-dom': '^19.1.9', typescript: '^5.9.2', vite: '^7.1.3' },
  }, null, 2))
  writeFileSync(resolve(app, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, types: ['vite/client', 'node'] }, include: ['src', 'server', 'collabhub.model.ts'] }, null, 2))
  writeFileSync(resolve(app, 'src/App.tsx'), "export function App() { return <main>Existing app</main> }\n")

  run('node', [resolve(root, 'packages/create-react/dist/cli.js'), 'init', app], root)
  if (readFileSync(resolve(app, 'src/App.tsx'), 'utf8') !== "export function App() { return <main>Existing app</main> }\n") throw new Error('init changed the existing App component')

  for (const directory of readdirSync(resolve(root, 'packages'), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const packageDirectory = resolve(root, 'packages', directory.name)
    const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'))
    if (!manifest.private) run('pnpm', ['pack', '--pack-destination', archives], packageDirectory)
  }
  const manifestPath = resolve(app, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const packageArchives = readdirSync(archives).filter((file) => file.endsWith('.tgz')).map((file) => resolve(archives, file))
  for (const archive of packageArchives) {
    const packed = JSON.parse(run('tar', ['-xOf', archive, 'package/package.json'], root))
    if (packed.name in (manifest.dependencies ?? {})) manifest.dependencies[packed.name] = `file:${archive}`
    if (packed.name in (manifest.devDependencies ?? {})) manifest.devDependencies[packed.name] = `file:${archive}`
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const installEnv = { ...process.env, npm_config_cache: resolve(scratch, '.npm-cache') }
  run('npm', ['install', '--registry=https://registry.npmjs.org', '--ignore-scripts=false', ...packageArchives], app, installEnv)
  const cli = resolve(app, 'node_modules/@collabhub/create-react/dist/cli.js')
  const doctor = JSON.parse(run('node', [cli, 'doctor', app, '--json'], app))
  if (!doctor.ok) throw new Error(`doctor failed: ${JSON.stringify(doctor)}`)
  run('npm', ['run', 'build'], app)

  server = spawn('npm', ['run', 'collabhub:server'], { cwd: app, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const logs = []
  server.stdout.on('data', (chunk) => logs.push(String(chunk)))
  server.stderr.on('data', (chunk) => logs.push(String(chunk)))
  await waitFor('http://127.0.0.1:8787/healthz', logs)
  const verification = JSON.parse(run('node', [cli, 'verify', '--url', 'ws://127.0.0.1:8787/collab', '--model-id', 'my-app'], app))
  if (!verification.ok || verification.linkedValue !== 42) throw new Error(`two-client verification failed: ${JSON.stringify(verification)}`)
  console.log(JSON.stringify({ event: 'existing_react_init_passed', appComponentChanged: false, doctor: true, build: true, twoClients: true, linkedValue: verification.linkedValue, documentId: verification.documentId }))
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') }
    catch { server.kill('SIGTERM') }
  }
  rmSync(scratch, { recursive: true, force: true })
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

async function waitFor(url, logs) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return }
    catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`timed out waiting for ${url}\n${logs.join('')}`)
}
