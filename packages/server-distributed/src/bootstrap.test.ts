import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { environmentWithDevelopmentFallback, requiredEnvironment } from './bootstrap.js'

const touched = new Set<string>()
const directories: string[] = []

afterEach(async () => {
  for (const name of touched) delete process.env[name]
  touched.clear()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function environment(name: string, value: string) {
  touched.add(name)
  process.env[name] = value
}

describe('file-backed runtime secrets', () => {
  it('loads a Docker/Kubernetes secret file without retaining its trailing newline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'collabhub-secret-'))
    directories.push(directory)
    const path = join(directory, 'internal-token')
    await writeFile(path, 'secret-from-file\n', { mode: 0o600 })
    environment('TEST_SECRET_FILE', path)

    expect(requiredEnvironment('TEST_SECRET')).toBe('secret-from-file')
  })

  it('fails when both direct and file-backed secret sources are configured', () => {
    environment('TEST_SECRET', 'direct')
    environment('TEST_SECRET_FILE', '/not/read')
    expect(() => requiredEnvironment('TEST_SECRET')).toThrow(/cannot both be set/)
  })

  it('does not silently supply a production secret', () => {
    environment('NODE_ENV', 'production')
    expect(() => environmentWithDevelopmentFallback('TEST_SECRET', 'development-only')).toThrow(/required/)
  })
})
