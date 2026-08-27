import { glob, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('BlockNote example boundaries', () => {
  it('keeps components, application, and domain independent from CollabHub packages', async () => {
    const files: string[] = []
    const pattern = `${fileURLToPath(new URL('../src', import.meta.url))}/{components,application,domain}/**/*.{ts,tsx}`
    for await (const file of glob(pattern)) files.push(file)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(await readFile(file, 'utf8')).not.toMatch(/@collabhub\//)
  })

  it('keeps the canonical domain independent from BlockNote', async () => {
    const domain = await readFile(fileURLToPath(new URL('../src/domain/block-document.ts', import.meta.url)), 'utf8')
    const serverPack = await readFile(fileURLToPath(new URL('../server/block-domain-pack.ts', import.meta.url)), 'utf8')
    expect(domain).not.toMatch(/@blocknote\//)
    expect(serverPack).not.toMatch(/@blocknote\//)
  })
})
