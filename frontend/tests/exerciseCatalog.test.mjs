import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/exerciseCatalog.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
})
const { loadExerciseCatalog } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

// Exercise the actual Supabase query builder, with only its network boundary mocked.
for (const count of [0, 1000, 1397]) {
  const rows = Array.from({ length: count }, (_, id) => ({ id: String(id), name: `Exercise ${id}` }))
  const offsets = []
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(input)
        assert.equal(url.pathname, '/rest/v1/exercises')
        assert.equal(url.searchParams.get('is_active'), 'eq.true')
        assert.equal(url.searchParams.get('order'), 'name.asc,id.asc')
        assert.equal(url.searchParams.get('limit'), '1000')
        const offset = Number(url.searchParams.get('offset'))
        offsets.push(offset)
        return Response.json(rows.slice(offset, offset + 1000))
      },
    },
  })
  assert.deepEqual(await loadExerciseCatalog(client), { data: rows, error: null })
  assert.deepEqual(offsets, count < 1000 ? [0] : [0, 1000])
}

const client = createClient('https://example.supabase.co', 'test-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input) => Number(new URL(input).searchParams.get('offset')) === 0
      ? Response.json(Array.from({ length: 1000 }, (_, id) => ({ id: String(id) })))
      : Response.json({ message: 'Catalog access denied', code: '42501' }, { status: 403 }),
  },
})
const failed = await loadExerciseCatalog(client)
assert.equal(failed.data, null)
assert.equal(failed.error.message, 'Catalog access denied')
console.log('exerciseCatalog tests passed')
