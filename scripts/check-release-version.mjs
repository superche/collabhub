import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expected = process.argv[2]
if (!expected || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expected)) throw new Error('expected a semantic version argument')

const manifests = [resolve(root, 'package.json')]
for (const entry of readdirSync(resolve(root, 'packages'), { withFileTypes: true })) {
  if (entry.isDirectory()) manifests.push(resolve(root, 'packages', entry.name, 'package.json'))
}
for (const manifestPath of manifests) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.version !== expected) throw new Error(`${manifest.name} is ${manifest.version}; expected ${expected}`)
}
console.log(JSON.stringify({ event: 'release_version_verified', version: expected, manifests: manifests.length }))
