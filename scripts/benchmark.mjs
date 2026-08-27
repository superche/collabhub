import { performance } from 'node:perf_hooks'
import { applyCanonicalPatches } from '../packages/domain-json/dist/index.js'

let state = { sections: Array.from({ length: 1_000 }, (_, index) => ({ id: `s-${index}`, heading: `Section ${index}`, body: '', orderKey: String(index * 1024) })) }
const samples = []
for (let index = 0; index < 1_200; index++) {
  const started = performance.now()
  state = applyCanonicalPatches(state, [{ op: 'entityUpsert', collection: 'sections', id: `s-${index % 1000}`, value: { id: `s-${index % 1000}`, heading: `Updated ${index}` } }])
  if (index >= 200) samples.push(performance.now() - started)
}
samples.sort((a, b) => a - b)
const p95 = samples[Math.floor(samples.length * 0.95)]
console.log(JSON.stringify({ dataset: '1000 sections', operations: samples.length, patchApplyP95Ms: Number(p95.toFixed(3)), budgetMs: 4, passed: p95 <= 4 }))
if (p95 > 4) process.exitCode = 1
