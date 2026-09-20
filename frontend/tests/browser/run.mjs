// Runs isolated synthetic browser regressions; never contacts a real backend.
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const suiteDirectory = dirname(fileURLToPath(import.meta.url))
const artifacts = resolve(process.env.QA_ARTIFACT_DIR || join(tmpdir(), 'strengthos-browser-qa'))
await mkdir(artifacts, { recursive: true })
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5178'
const baseUrl = new URL(base)
if (!['127.0.0.1', 'localhost'].includes(baseUrl.hostname)) throw new Error('QA server must be local')
const env = { ...process.env, QA_ARTIFACT_DIR: artifacts, QA_BASE_URL: base }
let server
const reports = []
try {
  if (process.env.QA_SKIP_SERVER !== '1') {
    const frontend = resolve(process.env.QA_FRONTEND_DIR || process.cwd())
    server = spawn(process.execPath, [join(frontend, 'node_modules/vite/bin/vite.js'), '--host', baseUrl.hostname, '--port', baseUrl.port || '5178', '--strictPort'], {
      cwd: frontend,
      env: { ...env, VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'fakepublishablekey', VITE_API_URL: `${base}/api` },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    server.stderr.on('data', data => process.stderr.write(data))
    const deadline = Date.now() + 15000
    while (true) {
      if (server.exitCode !== null) throw new Error('QA server failed to start')
      try { if ((await fetch(base)).ok) break } catch {}
      if (Date.now() > deadline) throw new Error('QA server startup timed out')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  const allSuites = ['features', 'recovery', 'surfaces', 'timers', 'progress', 'workflows', 'media', 'import-scale', 'history', 'analytics', 'records', 'grouping', 'edge']
  const selectedSuites = process.env.QA_SUITES ? process.env.QA_SUITES.split(',') : allSuites
  if (selectedSuites.some(suite => !allSuites.includes(suite))) throw new Error('Unknown QA suite')
  for (const suite of selectedSuites) {
    console.log(`Running ${suite}`)
    const child = spawn(process.execPath, [join(suiteDirectory, `${suite}.mjs`)], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', errors = ''
    child.stdout.on('data', data => { output += data; process.stdout.write(data) })
    child.stderr.on('data', data => { errors += data; process.stderr.write(data) })
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
    const checks = output.split('\n').flatMap(line => { try { const result = JSON.parse(line); return typeof result.passed === 'boolean' ? [result] : [] } catch { return [] } })
    reports.push({ suite, exitCode: code, checks, errors })
    await writeFile(join(artifacts, 'suite-report.json'), JSON.stringify(reports, null, 2))
  }
  const checks = reports.flatMap(report => report.checks)
  console.log(JSON.stringify({ artifacts, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length, total: checks.length }))
  if (reports.some(report => report.exitCode !== 0 || report.checks.some(check => !check.passed))) process.exitCode = 1
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
}
