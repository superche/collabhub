import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = resolve(root, 'packages')
const outputIndex = process.argv.indexOf('--output')
const requestedOutput = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined
const persistentOutput = requestedOutput ? resolve(root, requestedOutput) : undefined
if (persistentOutput && !persistentOutput.startsWith(resolve(root, 'artifacts') + '/')) throw new Error('package output must be inside artifacts/')
if (persistentOutput) { rmSync(persistentOutput, { recursive: true, force: true }); mkdirSync(persistentOutput, { recursive: true }) }
const packDirectory = persistentOutput ?? mkdtempSync(resolve(tmpdir(), 'collabhub-pack-'))
const evidence = []

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

function containsWorkspaceProtocol(value) {
  if (typeof value === 'string') return value.startsWith('workspace:')
  if (Array.isArray(value)) return value.some(containsWorkspaceProtocol)
  return value && typeof value === 'object' && Object.values(value).some(containsWorkspaceProtocol)
}

try {
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const packageDirectory = resolve(packagesRoot, entry.name)
    const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'))
    if (manifest.private) continue
    for (const field of ['name', 'version', 'description', 'license', 'repository', 'files', 'types', 'exports', 'publishConfig']) {
      if (!manifest[field]) throw new Error(`${manifest.name} is missing ${field}`)
    }
    const exportPath = resolve(packageDirectory, manifest.exports['.'].import)
    const typesPath = resolve(packageDirectory, manifest.exports['.'].types)
    if (!existsSync(exportPath) || !existsSync(typesPath)) throw new Error(`${manifest.name} has missing export artifacts`)
    await import(`${pathToFileURL(exportPath).href}?package-audit=${Date.now()}`)

    const before = new Set(readdirSync(packDirectory))
    run('pnpm', ['pack', '--pack-destination', packDirectory], packageDirectory)
    const archive = readdirSync(packDirectory).find((file) => !before.has(file))
    if (!archive) throw new Error(`${manifest.name} did not produce a tarball`)
    const archivePath = resolve(packDirectory, archive)
    const files = run('tar', ['-tf', archivePath], root).trim().split('\n')
    const packedManifest = JSON.parse(run('tar', ['-xOf', archivePath, 'package/package.json'], root))
    if (containsWorkspaceProtocol(packedManifest)) throw new Error(`${manifest.name} tarball still contains workspace: dependencies`)
    if (!files.includes('package/dist/index.js') || !files.includes('package/dist/index.d.ts')) throw new Error(`${manifest.name} tarball is missing dist entrypoints`)
    if (files.some((file) => file.startsWith('package/src/') || file.includes('.test.'))) throw new Error(`${manifest.name} tarball contains package source or test files`)
    if (manifest.bin) {
      const executable = String(Object.values(manifest.bin)[0]).replace(/^\.\//, '')
      if (!files.includes(`package/${executable}`)) throw new Error(`${manifest.name} tarball is missing its executable`)
    }
    evidence.push({ name: manifest.name, archive: basename(archivePath), files: files.length })
  }
  console.log(JSON.stringify({ event: 'package_artifacts_verified', packages: evidence }, null, 2))
} finally {
  if (!persistentOutput) rmSync(packDirectory, { recursive: true, force: true })
}
