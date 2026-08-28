#!/usr/bin/env node
import { doctorProject, initExistingReactApp, scaffoldReactApp, verifyTwoClients } from './index.js'

const [commandOrTarget = 'collabhub-react-app', ...rest] = process.argv.slice(2)

try {
  if (commandOrTarget === 'init') {
    const target = initExistingReactApp(value(rest, '--path') ?? rest.find((item) => !item.startsWith('--')) ?? '.')
    console.log(`CollabHub added to ${target}`)
    console.log('Next: npm install && npm run collabhub:doctor')
  } else if (commandOrTarget === 'doctor') {
    const report = doctorProject(value(rest, '--path') ?? rest.find((item) => !item.startsWith('--')) ?? '.')
    if (rest.includes('--json')) console.log(JSON.stringify(report, null, 2))
    else {
      for (const check of report.checks) console.log(`${check.level === 'pass' ? '✓' : check.level === 'warn' ? '!' : '✗'} ${check.message}`)
      console.log(report.ok ? 'Ready to connect a React component.' : 'Fix the failed checks, then run doctor again.')
    }
    if (!report.ok) process.exitCode = 1
  } else if (commandOrTarget === 'verify') {
    const result = await verifyTwoClients({
      url: value(rest, '--url') ?? 'ws://127.0.0.1:8787/collab',
      modelId: value(rest, '--model-id') ?? 'my-app',
      authToken: value(rest, '--token') ?? process.env.COLLABHUB_AUTH_TOKEN,
      origin: value(rest, '--origin') ?? process.env.COLLABHUB_VERIFY_ORIGIN,
    })
    console.log(JSON.stringify(result, null, 2))
  } else {
    const target = scaffoldReactApp(commandOrTarget)
    console.log(`Created ${target}`)
    console.log(`Next: cd ${commandOrTarget} && npm install && npm run dev`)
    console.log('Alice: http://127.0.0.1:5173/?client=alice')
    console.log('Bob:   http://127.0.0.1:5174/?client=bob')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

function value(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
