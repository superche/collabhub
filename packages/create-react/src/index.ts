import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
