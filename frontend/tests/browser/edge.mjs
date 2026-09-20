import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, ACTIVE, NAMES } from './harness.mjs'

async function until(predicate, message) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  assert.fail(message)
}
async function run(name, database, action) {
  const qa = await startHarness({ database }); qa.page.setDefaultTimeout(6000)
  try { await action(qa); assert.deepEqual(qa.events.unexpected, []); assert.deepEqual(qa.events.errors, []); console.log(JSON.stringify({ name, passed: true })) }
  finally { await qa.close(`edge-${name.slice(0, 16).replaceAll(' ', '-')}`) }
}
function removeSecondHistory(db) {
  const keep = db.workouts.filter(row => row.id !== '20000000-0000-4000-8000-000000000003').map(row => row.id)
  const exercises = db.workout_exercises.filter(row => keep.includes(row.workout_id))
  const ids = new Set(exercises.map(row => row.id))
  db.workouts = db.workouts.filter(row => keep.includes(row.id)); db.workout_exercises = exercises; db.workout_sets = db.workout_sets.filter(row => ids.has(row.workout_exercise_id))
}

const duplicate = fixture(); removeSecondHistory(duplicate)
const original = duplicate.workout_exercises.find(row => row.workout_id === '20000000-0000-4000-8000-000000000002' && row.exercise_id === duplicate.exercises[0].id)
const copy = { ...original, id: '40000000-0000-4000-8000-000000000099', exercise_order: 99 }
duplicate.workout_exercises.push(copy)
duplicate.workout_sets.push({ id: '50000000-0000-4000-8000-000000000099', workout_exercise_id: copy.id, set_order: 0, weight: 135, reps: 12, is_completed: true, completed_at: '2026-09-16T16:05:00.000Z', notes: null, set_type: 'working', duration_seconds: null, assistance_weight: null, bodyweight: null, rpe: 8, operation_id: null })
await run('duplicate blocks do not count as two progression sessions', duplicate, async ({ page }) => {
  await page.goto(`${BASE}/workout/active`)
  await page.getByText(NAMES[0], { exact: true }).first().waitFor()
  assert.equal(await page.getByText('Next session:', { exact: true }).count(), 0)
})

const modes = fixture()
for (const item of modes.workout_exercises.filter(row => row.exercise_id === modes.exercises[0].id && row.workout_id !== ACTIVE)) item.logging_mode = 'bodyweight_reps'
await run('mismatched logging snapshots do not supply PR or guidance baselines', modes, async ({ page, database }) => {
  await page.goto(`${BASE}/workout/active`)
  const card = page.getByText(NAMES[0], { exact: true }).first().locator('xpath=ancestor::section[1]')
  assert.equal(await card.getByText('Next session:', { exact: true }).count(), 0)
  const weight = card.getByRole('textbox', { name: 'weight', exact: true }).nth(1)
  await weight.fill('135'); await weight.press('Tab')
  await until(() => database.workout_sets[1].weight === 135, 'Weight should save')
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(() => database.workout_sets[1].is_completed, 'Set should complete')
  assert.doesNotMatch(await page.locator('body').innerText(), /beat \d+/i)
})

const zeroAssistance = fixture()
await run('assisted zero-rep sets do not announce a PR', zeroAssistance, async ({ page, database }) => {
  const targetSet = database.workout_sets.find(row => row.id === '50000000-0000-4000-8000-000000000032')
  targetSet.reps = 0; targetSet.assistance_weight = 0
  await page.goto(`${BASE}/workout/active`)
  const card = page.getByText(NAMES[3], { exact: true }).first().locator('xpath=ancestor::section[1]')
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(() => targetSet.is_completed, 'Set should complete')
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(await page.getByText(/New personal record/).count(), 0)
})
