import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(resolve(tmpdir(), 'collabhub-fresh-react-'))
const archives = resolve(scratch, 'archives')
const app = resolve(scratch, 'fresh-react-app')
let development
let browser

try {
  run('node', [resolve(root, 'packages/create-react/dist/cli.js'), app], root)
  for (const businessFile of ['src/App.tsx', 'src/application.ts']) {
    if (readFileSync(resolve(app, businessFile), 'utf8').includes('@collabhub/')) throw new Error(`${businessFile} imports CollabHub directly`)
  }
  run('mkdir', ['-p', archives], root)
  for (const directory of readdirSync(resolve(root, 'packages'), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const packageDirectory = resolve(root, 'packages', directory.name)
    const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'))
    if (!manifest.private) run('pnpm', ['pack', '--pack-destination', archives], packageDirectory)
  }
  const manifestPath = resolve(app, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const archive of readdirSync(archives).filter((file) => file.endsWith('.tgz'))) {
    const packed = JSON.parse(run('tar', ['-xOf', resolve(archives, archive), 'package/package.json'], root))
    if (packed.name.startsWith('@collabhub/')) manifest.dependencies[packed.name] = `file:${resolve(archives, archive)}`
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  run('npm', ['install', '--registry=https://registry.npmjs.org', '--ignore-scripts=false'], app)
  run('npm', ['run', 'build'], app)
  development = spawn('npm', ['run', 'dev'], { cwd: app, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const logs = []
  development.stdout.on('data', (chunk) => logs.push(String(chunk)))
  development.stderr.on('data', (chunk) => logs.push(String(chunk)))
  await Promise.all([waitFor('http://127.0.0.1:5173'), waitFor('http://127.0.0.1:5174'), waitFor('http://127.0.0.1:4100/healthz')])
  browser = await chromium.launch({ headless: true })
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  await Promise.all([
    alice.goto('http://127.0.0.1:5173/?client=alice'),
    bob.goto('http://127.0.0.1:5174/?client=bob'),
  ])
  await Promise.all([
    alice.getByTestId('connection').waitFor({ state: 'visible' }),
    bob.getByTestId('connection').waitFor({ state: 'visible' }),
  ])
  await waitForText(alice, 'connection', 'online')
  await waitForText(bob, 'connection', 'online')
  await alice.getByTestId('shared-title').fill('Fresh install works')
  await alice.getByTestId('shared-title').press('Tab')
  await waitForValue(bob, 'shared-title', 'Fresh install works')
  await waitForText(alice, 'version', '1')
  await waitForText(bob, 'version', '1')
  console.log(JSON.stringify({ event: 'fresh_react_install_passed', install: 'npm tarballs', businessImports: 0, aliceVersion: 1, bobVersion: 1, title: 'Fresh install works' }))
  await Promise.all([aliceContext.close(), bobContext.close()])
} catch (error) {
  console.error(development ? 'fresh starter process failed' : 'fresh starter setup failed')
  throw error
} finally {
  await browser?.close().catch(() => undefined)
  if (development?.pid) {
    try { process.kill(-development.pid, 'SIGTERM') }
    catch { development.kill('SIGTERM') }
  }
  rmSync(scratch, { recursive: true, force: true })
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

async function waitFor(url) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return }
    catch { /* process is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function waitForText(page, testId, expected) {
  await page.waitForFunction(([id, value]) => document.querySelector(`[data-testid="${id}"]`)?.textContent === value, [testId, expected])
}

async function waitForValue(page, testId, expected) {
  await page.waitForFunction(([id, value]) => document.querySelector(`[data-testid="${id}"]`)?.value === value, [testId, expected])
}
