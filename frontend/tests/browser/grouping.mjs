import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, NAMES } from './harness.mjs'

async function until(predicate, message) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  assert.fail(message)
}

async function metric(page) {
  await page.goto(`${BASE}/analytics`)
  await page.getByRole('combobox', { name: 'Exercise', exact: true }).selectOption('30000000-0000-4000-8000-000000000001')
  const card = page.getByText('Best Volume', { exact: true }).locator('..')
  await card.waitFor()
  return card
}

const combined = fixture()
const sameWorkout = combined.workouts[1]
const original = combined.workout_exercises.find(row => row.workout_id === sameWorkout.id && row.exercise_id === combined.exercises[0].id)
const duplicate = { ...original, id: '40000000-0000-4000-8000-000000000099', exercise_order: 99 }
combined.workout_exercises.push(duplicate)
combined.workout_sets.push({ id: '50000000-0000-4000-8000-000000000099', workout_exercise_id: duplicate.id, set_order: 0, weight: 100, reps: 5, is_completed: true, completed_at: '2026-09-16T16:05:00.000Z', notes: null, set_type: 'working', duration_seconds: null, assistance_weight: null, bodyweight: null, rpe: 8, operation_id: null })
const qa = await startHarness({ database: combined }); qa.page.setDefaultTimeout(6000)
try {
  const card = await metric(qa.page)
  await until(async () => /2,795/.test(await card.innerText()), 'Repeated exercise blocks in one workout must combine into one session volume')
  assert.equal((await qa.page.locator('svg circle').count()) >= 2, true, 'Combined history should retain separate workout points')
  assert.deepEqual(qa.events.unexpected, [])
  assert.deepEqual(qa.events.errors, [])
  console.log(JSON.stringify({ name: 'repeated exercise blocks combine within one workout', passed: true }))
} finally { await qa.close('grouping-combined-results') }

const separate = fixture()
const first = separate.workouts[1]
const second = separate.workouts[2]
first.started_at = '2026-09-16T15:00:00.000Z'; first.completed_at = '2026-09-16T15:45:00.000Z'
second.started_at = '2026-09-16T18:00:00.000Z'; second.completed_at = '2026-09-16T18:45:00.000Z'
for (const workoutId of [first.id, second.id]) {
  const we = separate.workout_exercises.find(row => row.workout_id === workoutId && row.exercise_id === separate.exercises[0].id)
  const rows = separate.workout_sets.filter(row => row.workout_exercise_id === we.id)
  rows[0].weight = workoutId === first.id ? 100 : 120; rows[0].reps = 10
  rows[1].weight = null; rows[1].reps = null; rows[1].is_completed = false
}
const qa2 = await startHarness({ database: separate }); qa2.page.setDefaultTimeout(6000)
try {
  const card = await metric(qa2.page)
  await until(async () => /1,200/.test(await card.innerText()), 'Same-day distinct workouts must remain separate sessions')
  assert.doesNotMatch(await card.innerText(), /2,200/)
  assert.deepEqual(qa2.events.unexpected, [])
  assert.deepEqual(qa2.events.errors, [])
  console.log(JSON.stringify({ name: 'same-day distinct workouts remain separate sessions', passed: true }))
} finally { await qa2.close('grouping-separate-results') }
