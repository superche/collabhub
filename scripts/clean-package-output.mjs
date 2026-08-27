import { readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = resolve(root, 'packages')

function clean(packageDirectory) {
  if (dirname(packageDirectory) !== packagesRoot || !statSync(resolve(packageDirectory, 'package.json')).isFile()) {
    throw new Error(`refusing to clean outside ${packagesRoot}: ${packageDirectory}`)
  }
  rmSync(resolve(packageDirectory, 'dist'), { recursive: true, force: true })
  rmSync(resolve(packageDirectory, 'dist-types'), { recursive: true, force: true })
}

if (process.argv.includes('--all')) {
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) clean(resolve(packagesRoot, entry.name))
  }
} else {
  clean(resolve(process.cwd()))
}
