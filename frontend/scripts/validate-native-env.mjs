import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

const ALLOWED_VITE_KEYS = new Set([
  'VITE_API_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
])

const CI_FIXTURE = {
  VITE_API_URL: 'https://api.example.com',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_placeholder',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
}

export function validateNativeEnvironment(env, capacitorConfigSource, { ciFixture = false } = {}) {
  const errors = []
  const viteKeys = Object.keys(env).filter((key) => key.startsWith('VITE_'))
  for (const key of viteKeys) {
    if (!ALLOWED_VITE_KEYS.has(key)) errors.push(`${key} is not allowed in the native bundle.`)
  }

  for (const key of ['VITE_API_URL', 'VITE_SUPABASE_URL']) {
    const value = env[key]
    try {
      const url = new URL(value)
      if (url.protocol !== 'https:' || url.username || url.password || isLocalHost(url.hostname)) {
        errors.push(`${key} must be a public HTTPS URL.`)
      }
      if (!ciFixture && isPlaceholderHost(url.hostname)) errors.push(`${key} cannot use a placeholder host for a release build.`)
    } catch {
      errors.push(`${key} must be a valid public HTTPS URL.`)
    }
  }

  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
  if (!publishableKey) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is required.')
  const legacyRole = jwtRole(publishableKey)
  if (publishableKey && !publishableKey.startsWith('sb_publishable_') && legacyRole !== 'anon') {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon JWT.')
  }
  if (!ciFixture && /placeholder|_test/i.test(publishableKey)) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY cannot use a placeholder for a release build.')
  }
  if (ciFixture) {
    for (const [key, value] of Object.entries(CI_FIXTURE)) {
      if (env[key] !== value) errors.push(`${key} must use the fixed CI fixture value.`)
    }
  }
  if (/\bserver\s*:/.test(capacitorConfigSource)) {
    errors.push('capacitor.config.ts must package local assets and cannot define server.url.')
  }
  return errors
}

function isLocalHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized.endsWith('.local')
}

function isPlaceholderHost(hostname) {
  const normalized = hostname.toLowerCase()
  return normalized === 'example.com' || normalized.endsWith('.example.com') || normalized.endsWith('.invalid')
}

function jwtRole(value) {
  const payload = value.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role ?? null
  } catch {
    return null
  }
}

async function main() {
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
  const config = await readFile(new URL('../capacitor.config.ts', import.meta.url), 'utf8')
  const ciFixture = process.argv.includes('--ci-fixture')
  const errors = validateNativeEnvironment(env, config, { ciFixture })
  if (errors.length) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
    return
  }
  console.log(ciFixture ? 'Native CI fixture configuration validated.' : 'Native production configuration is safe to bundle.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
