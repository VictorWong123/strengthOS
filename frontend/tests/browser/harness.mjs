const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || 'playwright')
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const ROOT = process.env.QA_ARTIFACT_DIR || join(tmpdir(), 'strengthos-browser-qa')
await mkdir(ROOT, { recursive: true })
export const TEST_TIME = '2026-09-19T18:00:00.000Z'
export const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5178'
export const USER = '10000000-0000-4000-8000-000000000001'
export const ACTIVE = '20000000-0000-4000-8000-000000000001'
export const MODES = ['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'assisted_bodyweight', 'duration']
export const NAMES = ['QA Bench Press', 'QA Pull Up', 'QA Weighted Dip', 'QA Assisted Pull Up', 'QA Plank']
const iso = (day, minute = '00') => `2026-09-${day}T14:${minute}:00.000Z`
const id = (prefix, index) => `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`

export function fixture() {
  const exercises = MODES.map((mode, index) => ({ id: id(3, index + 1), external_id: `qa-${index}`, source: 'custom', user_id: USER, name: NAMES[index], normalized_name: NAMES[index].toLowerCase(), primary_muscle: index === 4 ? 'abdominals' : index % 2 ? 'lats' : 'pectorals', secondary_muscles: ['triceps'], body_part: index === 4 ? 'waist' : 'upper body', equipment: index === 4 ? 'body weight' : 'barbell', movement_category: 'strength', instructions: ['Controlled movement.'], image_url: null, animation_url: null, thumbnail_url: null, is_custom: true, is_active: true, logging_mode: mode }))
  const workouts = ['19', '16', '12'].map((day, index) => ({ id: id(2, index + 1), user_id: USER, name: index ? `QA History ${day}` : 'QA Active Workout', started_at: iso(day), completed_at: index ? iso(day, '45') : null, notes: index ? 'Historical workout note' : 'Active note', revision: 0, duration_seconds: index ? 2700 : null, paused_at: null, accumulated_pause_seconds: 0, source: 'strengthos', external_id: null, import_hash: null }))
  const workout_exercises = workouts.flatMap((workout, wi) => exercises.map((exercise, ei) => ({ id: id(4, wi * 10 + ei + 1), workout_id: workout.id, exercise_id: exercise.id, exercise_order: ei, notes: 'Seat position 4', logging_mode: exercise.logging_mode, target_sets: 2, target_reps: '8-12', target_rpe: 8, rest_seconds: 60, timer_enabled: true, session_notes: wi ? 'Previous exercise observation' : null, superset_group: ei === 1 || ei === 2 ? 'QA-A' : null, source_name: exercise.name })))
  const workout_sets = workout_exercises.flatMap((item, index) => [0, 1].map(si => {
    const ei = index % 5
    const historical = item.workout_id !== ACTIVE
    return { id: id(5, index * 10 + si + 1), workout_exercise_id: item.id, set_order: si, weight: [135, null, 25, null, null][ei], reps: ei === 4 ? null : 8 + si, is_completed: historical || si === 0, notes: si ? null : 'Set note', completed_at: historical || si === 0 ? iso(historical ? '16' : '19', '05') : null, set_type: index === 0 && si === 0 ? 'warmup' : ei === 2 && si === 0 ? 'drop' : ei === 3 && si === 0 ? 'failure' : 'working', duration_seconds: ei === 4 ? 30 + si * 15 : null, assistance_weight: ei === 3 ? 40 : null, bodyweight: ei > 0 && ei < 4 ? 170 : null, rpe: historical ? 8 : null, operation_id: null }
  }))
  const routines = [{ id: id(6, 1), user_id: USER, name: 'QA Routine', notes: 'Routine cues', created_at: iso('01'), updated_at: iso('01') }]
  const routine_exercises = exercises.map((exercise, i) => ({ id: id(7, i + 1), routine_id: routines[0].id, exercise_id: exercise.id, exercise_order: i, target_sets: 2, target_reps: '8-12', target_rpe: 8, notes: 'Seat position 4', created_at: iso('01'), rest_seconds: 60, timer_enabled: true, superset_group: null }))
  return { exercises, workouts, workout_exercises, workout_sets, routines, routine_exercises, profiles: [{ id: USER, display_name: 'QA User', first_name: 'QA', last_name: 'User', age: 30, body_weight_lbs: 170, height_inches: 70, training_goal: 'strength', training_experience: 'intermediate', limitations: null }], body_measurements: [], progress_photos: [], exercise_cues: [], exercise_preferences: [], workout_timers: [], workout_operations: [] }
}

function matches(row, key, expression) {
  const dot = expression.indexOf('.')
  const op = expression.slice(0, dot)
  const value = expression.slice(dot + 1)
  if (op === 'eq') return String(row[key]) === value
  if (op === 'neq') return String(row[key]) !== value
  if (op === 'in') return value.slice(1, -1).split(',').map(s => s.replaceAll('"', '')).includes(String(row[key]))
  if (op === 'is') return value === 'null' ? row[key] == null : String(row[key]) === value
  if (op === 'gte') return String(row[key]) >= value
  if (op === 'lte') return String(row[key]) <= value
  throw new Error(`Unsupported fixture filter ${key}=${expression}`)
}

export async function startHarness({ width = 390, height = 844, rpc = {}, database = fixture(), backend, timezone = 'America/New_York', testTime = TEST_TIME } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps'] })
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: timezone, serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.clock.install({ time: new Date(testTime) })
  const events = { requests: [], unexpected: [], errors: [], console: [], checks: [] }
  const failure = { predicate: null, status: 503, message: 'QA simulated connection failure', once: true }
  const operations = new Map()
  const mutationControl = { delayMs: 0, loseNextResponse: false }
  async function saveMutation({ body, database, fulfill, route }, kind) {
    if (mutationControl.delayMs) await new Promise(resolve => setTimeout(resolve, mutationControl.delayMs))
    const fingerprint = JSON.stringify([kind, body.p_workout_id, body.p_set_id, body.p_patch])
    const existing = operations.get(body.p_operation_id)
    if (existing) {
      if (existing.fingerprint !== fingerprint) return fulfill({ code: 'P0001', message: 'Operation id reused with different payload' }, 400)
      return fulfill(existing.result)
    }
    const workout = database.workouts.find(row => row.id === body.p_workout_id)
    if (!workout) return fulfill({ code: 'P0001', message: 'Workout not found' }, 400)
    if (workout.revision !== body.p_expected_revision) return fulfill({ code: '40001', message: 'Workout changed in another session' }, 409)
    const target = kind === 'set' ? database.workout_sets.find(row => row.id === body.p_set_id) : workout
    if (!target) return fulfill({ code: 'P0001', message: 'Workout set not found' }, 400)
    if (kind === 'set' && body.p_patch.rpe != null && !(body.p_patch.rpe >= 1 && body.p_patch.rpe <= 10)) return fulfill({ code: '23514', message: 'RPE must be between 1 and 10' }, 400)
    Object.assign(target, body.p_patch)
    if (kind === 'set') target.operation_id = body.p_operation_id
    workout.revision += 1
    const result = structuredClone({ [kind]: target, revision: workout.revision })
    operations.set(body.p_operation_id, { fingerprint, result })
    if (mutationControl.loseNextResponse) {
      mutationControl.loseNextResponse = false
      return route.abort('connectionfailed')
    }
    return fulfill(result)
  }
  async function saveStructure({ body, database, fulfill }, kind) {
    const fingerprint = JSON.stringify([kind, body.p_workout_id, body.p_set_id, body.p_workout_exercise_id, body.p_values, body.p_patches])
    const existing = operations.get(body.p_operation_id)
    if (existing) {
      if (existing.fingerprint !== fingerprint) return fulfill({ code: 'P0001', message: 'Operation id reused with different payload' }, 400)
      return fulfill(existing.result)
    }
    const workout = database.workouts.find(row => row.id === body.p_workout_id)
    if (!workout) return fulfill({ code: 'P0001', message: 'Workout not found' }, 400)
    if (workout.revision !== body.p_expected_revision) return fulfill({ code: '40001', message: 'Workout changed in another session' }, 409)
    let result
    if (kind === 'add') {
      const rows = database.workout_sets.filter(row => row.workout_exercise_id === body.p_workout_exercise_id)
      const set = { id: body.p_set_id, workout_exercise_id: body.p_workout_exercise_id, set_order: rows.length ? Math.max(...rows.map(row => row.set_order)) + 1 : 0, weight: null, reps: null, duration_seconds: null, assistance_weight: null, bodyweight: null, rpe: null, is_completed: false, completed_at: null, notes: null, set_type: 'working', operation_id: body.p_operation_id, ...body.p_values }
      database.workout_sets.push(set)
      result = { set }
    } else if (kind === 'delete') {
      database.workout_sets = database.workout_sets.filter(row => row.id !== body.p_set_id)
      result = { set_id: body.p_set_id }
    } else {
      const changed = []
      for (const patch of body.p_patches) {
        const row = database.workout_exercises.find(row => row.id === patch.id)
        if (row) { Object.assign(row, patch); changed.push(row) }
      }
      result = { workout_exercises: changed }
    }
    result.revision = ++workout.revision
    result = structuredClone(result)
    operations.set(body.p_operation_id, { fingerprint, result })
    return fulfill(result)
  }
  async function mutateExercise({ body, database, fulfill }) {
    const fingerprint = JSON.stringify(body)
    const existing = operations.get(body.p_operation_id)
    if (existing) return fulfill(existing.result)
    const workout = database.workouts.find(row => row.id === body.p_workout_id)
    if (!workout || workout.revision !== body.p_expected_revision) return fulfill({ code: '40001', message: 'Workout changed in another session' }, 409)
    const target = database.workout_exercises.find(row => row.id === body.p_target_id)
    const completed = database.workout_sets.some(row => row.workout_exercise_id === target?.id && row.is_completed)
    let removed_id = null
    if (body.p_action === 'remove' || (body.p_action === 'replace' && !completed)) {
      if (body.p_action === 'remove' && completed) return fulfill({ code: 'P0001', message: 'Completed work must be preserved' }, 400)
      removed_id = target.id
      database.workout_exercises = database.workout_exercises.filter(row => row.id !== removed_id)
      database.workout_sets = database.workout_sets.filter(row => row.workout_exercise_id !== removed_id)
    }
    let inserted = null
    if (body.p_action !== 'remove') {
      const rows = database.workout_exercises.filter(row => row.workout_id === body.p_workout_id)
      if (body.p_action === 'replace' && !removed_id) for (const row of rows) if (row.exercise_order > target.exercise_order) row.exercise_order++
      inserted = { id: body.p_new_id, workout_id: body.p_workout_id, exercise_id: body.p_exercise_id, exercise_order: body.p_action === 'replace' ? target.exercise_order + (removed_id ? 0 : 1) : (rows.length ? Math.max(...rows.map(row => row.exercise_order)) + 1 : 0), logging_mode: body.p_logging_mode, source_name: body.p_source_name, notes: null, target_sets: null, target_reps: null, target_rpe: null, rest_seconds: null, timer_enabled: true, session_notes: null, superset_group: null }
      database.workout_exercises.push(inserted)
    }
    const result = structuredClone({ workout_exercise: inserted, removed_id, revision: ++workout.revision })
    operations.set(body.p_operation_id, { fingerprint, result })
    return fulfill(result)
  }
  const handlers = {
    mutate_workout_exercise: args => mutateExercise(args),
    save_workout_set: args => saveMutation(args, 'set'),
    save_workout: args => saveMutation(args, 'workout'),
    add_workout_set: args => saveStructure(args, 'add'),
    delete_workout_set: args => saveStructure(args, 'delete'),
    save_workout_exercises: args => saveStructure(args, 'exercises'),
    ...rpc,
  }
  const user = { id: USER, aud: 'authenticated', role: 'authenticated', email: 'qa@example.test', email_confirmed_at: iso('01'), confirmed_at: iso('01'), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: iso('01'), updated_at: iso('01') }
  const payload = Buffer.from(JSON.stringify({ sub: USER, aud: 'authenticated', role: 'authenticated', email: user.email, exp: 2208988800, iat: 1789776000 })).toString('base64url')
  const session = { access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.qa`, refresh_token: 'qa-refresh-token', expires_in: 315360000, expires_at: 2208988800, token_type: 'bearer', user }
  await context.addInitScript(({ session }) => {
    if (!localStorage.getItem('sb-example-auth-token')) localStorage.setItem('sb-example-auth-token', JSON.stringify(session))
    localStorage.setItem('strengthos:routine-reorder-hint:dismissed', '1')
  }, { session })
  page.on('pageerror', error => events.errors.push(error.message))
  page.on('console', message => { if (message.type() !== 'debug') events.console.push({ type: message.type(), text: message.text() }) })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === BASE && !url.pathname.startsWith('/api')) return route.continue()
    let body = request.postData()
    try { body = body ? JSON.parse(body) : null } catch { body = `[non-JSON body: ${body.length} bytes]` }
    let actor = null
    try { actor = JSON.parse(Buffer.from((request.headers().authorization ?? '').split('.')[1], 'base64url').toString()).sub ?? null } catch {}
    const entry = { method: request.method(), url: request.url(), body, actor }
    events.requests.push(entry)
    const fulfill = (body, status = 200, extra = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...extra }, body: body === undefined ? '' : JSON.stringify(body) })
    if (failure.predicate?.(entry)) {
      if (failure.once) failure.predicate = null
      return fulfill({ message: failure.message, code: 'QA503' }, failure.status)
    }
    if (url.origin === 'https://example.supabase.co') {
      if (url.pathname === '/auth/v1/user') return fulfill(user)
      if (url.pathname === '/auth/v1/token') return fulfill(session)
      if (url.pathname === '/auth/v1/logout') return fulfill(undefined, 204)
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').at(-1)
        if (handlers[name]) return handlers[name]({ body: entry.body, database, fulfill, entry, route })
        events.unexpected.push(entry)
        return fulfill({ message: `Unhandled QA RPC: ${name}` }, 501)
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.split('/').at(-1)
        if (!(table in database)) {
          events.unexpected.push(entry)
          return fulfill({ message: `Unhandled QA table: ${table}` }, 501)
        }
        const filters = [...url.searchParams].filter(([key]) => !['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key))
        let rows = database[table].filter(row => filters.every(([key, expression]) => matches(row, key, expression)))
        if (request.method() === 'POST') {
          const defaults = {
            workouts: { user_id: USER, name: 'Workout', started_at: new Date().toISOString(), completed_at: null, notes: null, revision: 0, duration_seconds: null, paused_at: null, accumulated_pause_seconds: 0, source: 'strengthos', external_id: null, import_hash: null },
            workout_exercises: { notes: null, logging_mode: 'weight_reps', target_sets: null, target_reps: null, target_rpe: null, rest_seconds: null, timer_enabled: true, session_notes: null, superset_group: null, source_name: null },
            workout_sets: { weight: null, reps: null, duration_seconds: null, assistance_weight: null, bodyweight: null, rpe: null, is_completed: false, completed_at: null, notes: null, set_type: 'working', operation_id: null },
            body_measurements: { bodyweight: null, neck: null, shoulders: null, chest: null, waist: null, hips: null, left_arm: null, right_arm: null, left_thigh: null, right_thigh: null, left_calf: null, right_calf: null, notes: null },
          }
          rows = (Array.isArray(entry.body) ? entry.body : [entry.body]).map(row => ({ id: randomUUID(), created_at: new Date().toISOString(), ...defaults[table], ...row }))
          const onConflict = (url.searchParams.get('on_conflict') ?? 'id').split(',')
          for (const row of rows) {
            const existing = database[table].find(item => onConflict.every(key => item[key] === row[key]))
            if (existing && (request.headers().prefer ?? '').includes('merge-duplicates')) Object.assign(existing, row)
            else database[table].push(row)
          }
        } else if (request.method() === 'PATCH') {
          for (const row of rows) Object.assign(row, entry.body)
        } else if (request.method() === 'DELETE') {
          database[table] = database[table].filter(row => !rows.includes(row))
        } else if (request.method() !== 'GET') {
          events.unexpected.push(entry)
          return route.abort()
        }
        const order = url.searchParams.get('order')
        if (order) rows.sort((a, b) => {
          for (const field of order.split(',')) {
            const [key, direction] = field.split('.')
            if (a[key] === b[key]) continue
            return (a[key] > b[key] ? 1 : -1) * (direction === 'desc' ? -1 : 1)
          }
          return 0
        })
        const total = rows.length
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Math.min(Number(url.searchParams.get('limit') ?? total), 1000)
        rows = rows.slice(offset, offset + limit)
        const single = (request.headers().accept ?? '').includes('vnd.pgrst.object')
        return fulfill(single ? rows[0] ?? null : rows, request.method() === 'POST' ? 201 : 200, { 'content-range': `${offset}-${Math.max(offset, offset + rows.length - 1)}/${total}` })
      }
    }
    if (url.origin === BASE && url.pathname.startsWith('/api/') && backend) return backend({ entry, route, url, database, fulfill })
    events.unexpected.push(entry)
    return route.abort('blockedbyclient')
  })
  return {
    browser, context, page, database, events, failure, mutationControl, operations,
    async capture(name) {
      await page.screenshot({ path: `${ROOT}/${name}.png`, fullPage: true })
      await page.screenshot({ path: `${ROOT}/${name}-viewport.png`, fullPage: false })
      await writeFile(`${ROOT}/${name}.txt`, await page.locator('body').innerText())
    },
    async close(name = 'results') {
      await writeFile(`${ROOT}/${name}.json`, JSON.stringify(events, null, 2))
      await browser.close()
    },
  }
}
