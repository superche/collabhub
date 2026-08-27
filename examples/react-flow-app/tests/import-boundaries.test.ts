import { glob, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('React Flow example boundaries', () => {
  it('keeps components, application, and domain independent from CollabHub packages', async () => {
    const files: string[] = []
    const pattern = `${fileURLToPath(new URL('../src', import.meta.url))}/{components,application,domain}/**/*.{ts,tsx}`
    for await (const file of glob(pattern)) files.push(file)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(await readFile(file, 'utf8')).not.toMatch(/@collabhub\//)
  })

  it('keeps the canonical graph and server Domain Pack independent from React Flow', async () => {
    const domain = await readFile(fileURLToPath(new URL('../src/domain/graph-document.ts', import.meta.url)), 'utf8')
    const serverPack = await readFile(fileURLToPath(new URL('../server/graph-domain-pack.ts', import.meta.url)), 'utf8')
    expect(domain).not.toMatch(/@xyflow\/|reactflow/)
    expect(serverPack).not.toMatch(/@xyflow\/|reactflow/)
  })
})
