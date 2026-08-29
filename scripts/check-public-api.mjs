import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const baselinePath = resolve(root, 'public-api-baseline.json')
const write = process.argv.includes('--write')
const packagesDirectory = resolve(root, 'packages')
const packageDirectories = (await readdir(packagesDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const current = { version: '1.0.0', packages: {} }

for (const directory of packageDirectories) {
  const manifest = JSON.parse(await readFile(resolve(packagesDirectory, directory, 'package.json'), 'utf8'))
  if (manifest.private) continue
  const declaration = resolve(packagesDirectory, directory, 'dist/index.d.ts')
  const source = (await readFile(declaration, 'utf8')).replace(/^\/\/# sourceMappingURL=.*$/gm, '').trim()
  current.packages[manifest.name] = {
    declaration: `packages/${directory}/dist/index.d.ts`,
    sha256: createHash('sha256').update(source).digest('hex'),
  }
}

if (write) {
  await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`)
  console.log(`Wrote ${baselinePath}`)
  process.exit(0)
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
if (JSON.stringify(current) !== JSON.stringify(baseline)) {
  console.error('Public API differs from the v1.0 baseline. Review compatibility, then run: node scripts/check-public-api.mjs --write')
  console.error(JSON.stringify({ baseline, current }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ event: 'public_api_stable', version: baseline.version, packages: Object.keys(current.packages).length }))
