import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { doctorProject, initExistingReactApp } from './index.js'

describe('existing React project init', () => {
  it('adds an integration without touching App components', () => {
    const root = resolve(tmpdir(), `collabhub-init-${Date.now()}-${Math.random()}`)
    mkdirSync(resolve(root, 'src'), { recursive: true })
    writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: { react: '^19.0.0' }, scripts: { dev: 'vite' } }))
    writeFileSync(resolve(root, 'src/App.tsx'), 'export function App() { return null }\n')
    initExistingReactApp(root)
    expect(readFileSync(resolve(root, 'src/App.tsx'), 'utf8')).toContain('return null')
    expect(readFileSync(resolve(root, 'collabhub.model.ts'), 'utf8')).toContain('verificationLinked')
    expect(readFileSync(resolve(root, 'src/collab/collabhub.ts'), 'utf8')).toContain('VITE_COLLABHUB_TOKEN_ENDPOINT')
    expect(readFileSync(resolve(root, 'src/collab/collabhub.ts'), 'utf8')).toContain('getAuthToken')
    expect(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).dependencies).not.toHaveProperty('@collabhub/model')
    expect(doctorProject(root).ok).toBe(true)
  })
})
