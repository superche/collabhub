#!/usr/bin/env node
import { scaffoldReactApp } from './index.js'

const targetArgument = process.argv[2] ?? 'collabhub-react-app'
let target: string
try { target = scaffoldReactApp(targetArgument) }
catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
console.log(`Created ${target}`)
console.log(`Next: cd ${targetArgument} && npm install && npm run dev`)
console.log('Alice: http://127.0.0.1:5173/?client=alice')
console.log('Bob:   http://127.0.0.1:5174/?client=bob')
