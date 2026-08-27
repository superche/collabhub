import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const inputIndex = process.argv.indexOf('--input')
const expectedIndex = process.argv.indexOf('--expected-version')
const input = resolve(process.cwd(), inputIndex >= 0 ? process.argv[inputIndex + 1] : 'artifacts/packages')
const expectedVersion = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : undefined
const dryRun = process.argv.includes('--dry-run')
const registry = 'https://registry.npmjs.org'

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', ...options })
  if (!options.allowFailure && result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  return result
}

const packages = readdirSync(input)
  .filter((file) => file.endsWith('.tgz'))
  .map((archive) => {
    const archivePath = resolve(input, archive)
    const manifest = JSON.parse(command('tar', ['-xOf', archivePath, 'package/package.json']).stdout)
    const templateResult = command('tar', ['-xOf', archivePath, 'package/template/package.json'], { allowFailure: true })
    const templateDependencies = templateResult.status === 0 ? JSON.parse(templateResult.stdout).dependencies ?? {} : {}
    if (!manifest.name?.startsWith('@collabhub/')) throw new Error(`unexpected package name in ${archive}`)
    if (expectedVersion && manifest.version !== expectedVersion) throw new Error(`${manifest.name} is ${manifest.version}, expected ${expectedVersion}`)
    return { archivePath, manifest, templateDependencies }
  })

if (packages.length === 0) throw new Error(`no package archives found in ${input}`)

const byName = new Map(packages.map((item) => [item.manifest.name, item]))
const ordered = []
const visiting = new Set()
const visited = new Set()

function visit(item) {
  if (visited.has(item.manifest.name)) return
  if (visiting.has(item.manifest.name)) throw new Error(`package dependency cycle at ${item.manifest.name}`)
  visiting.add(item.manifest.name)
  const dependencies = { ...item.manifest.dependencies, ...item.manifest.peerDependencies, ...item.templateDependencies }
  for (const name of Object.keys(dependencies).sort()) if (byName.has(name)) visit(byName.get(name))
  visiting.delete(item.manifest.name)
  visited.add(item.manifest.name)
  ordered.push(item)
}

for (const item of [...packages].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))) visit(item)

const evidence = []
for (const item of ordered) {
  const id = `${item.manifest.name}@${item.manifest.version}`
  const existing = command('npm', ['view', id, 'version', `--registry=${registry}`, '--json'], { allowFailure: true })
  if (existing.status === 0) {
    const publishedVersion = JSON.parse(existing.stdout)
    if (publishedVersion !== item.manifest.version) throw new Error(`registry returned an unexpected version for ${id}`)
    evidence.push({ package: id, action: 'already-published' })
    continue
  }
  const registryMessage = `${existing.stdout}\n${existing.stderr}`
  if (!registryMessage.includes('E404') && !registryMessage.includes('404 Not Found')) {
    throw new Error(`could not determine registry state for ${id}:\n${registryMessage}`)
  }
  const args = ['publish', item.archivePath, `--registry=${registry}`, '--access=public']
  if (dryRun) args.push('--dry-run')
  else args.push('--provenance')
  command('npm', args, { env: process.env })
  evidence.push({ package: id, action: dryRun ? 'dry-run' : 'published' })
}

console.log(JSON.stringify({ event: 'npm_packages_processed', provenance: !dryRun, packages: evidence }, null, 2))
