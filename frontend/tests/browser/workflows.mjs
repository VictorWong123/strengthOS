import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, NAMES, ACTIVE, TEST_TIME } from './harness.mjs'

async function until(predicate, message, timeout = 4000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 30)) }
  assert.fail(message)
}
const reports = []
async function scenario(name, { active = false } = {}, action) {
  if (process.env.QA_ONLY && !name.includes(process.env.QA_ONLY)) return
  const db = fixture()
  if (!active) {
    const weIds = db.workout_exercises.filter(item => item.workout_id === ACTIVE).map(item => item.id)
    db.workout_sets = db.workout_sets.filter(item => !weIds.includes(item.workout_exercise_id))
    db.workout_exercises = db.workout_exercises.filter(item => item.workout_id !== ACTIVE)
    db.workouts = db.workouts.filter(item => item.id !== ACTIVE)
  }
  const qa = await startHarness({ database: db })
  const page = qa.page; page.setDefaultTimeout(6000)
  const card = name => page.getByText(name, { exact: true }).first().locator('xpath=ancestor::section[1]')
  try {
    await action({ qa, page, card, db })
    assert.deepEqual(qa.events.unexpected, [])
    assert.deepEqual(qa.events.errors, [])
    reports.push({ name, passed: true })
  } catch (error) {
    reports.push({ name, passed: false, message: error.message }); await qa.capture(`workflows-${reports.length}-failure`)
  } finally { qa.events.checks.push(reports.at(-1)); await qa.close(`workflows-${reports.length}-results`); console.log(JSON.stringify(reports.at(-1))) }
}

await scenario('routine start snapshots modes/targets/rest; log and finish appears in history', {}, async ({ page, card, db, qa }) => {
  await page.goto(`${BASE}/workout`)
  await page.getByRole('button', { name: 'Start Routine', exact: true }).click()
  await card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1).waitFor()
  const workout = db.workouts.find(item => item.completed_at === null)
  assert(workout && workout.name === 'QA Routine')
  const snapshots = db.workout_exercises.filter(item => item.workout_id === workout.id)
  assert.equal(snapshots.length, 5)
  assert(snapshots.every(item => item.target_rpe === 8 && item.target_sets === 2 && item.rest_seconds === 60))
  const weight = card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1)
  await weight.fill('145'); await weight.press('Tab')
  await card(NAMES[0]).getByRole('button', { name: 'Mark set complete', exact: true }).nth(1).click()
  await page.getByRole('button', { name: 'Finish Workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save Workout', exact: true }).click()
  await until(() => workout.completed_at !== null, 'Completed session should persist')
  await page.goto(`${BASE}/history`)
  await page.getByText('QA Routine', { exact: true }).first().waitFor()
  await qa.capture('completed-routine-history')
})

await scenario('missed session retains chosen historical date after finishing', {}, async ({ page, db, qa }) => {
  await page.goto(`${BASE}/history`)
  await page.getByRole('textbox', { name: 'Missed workout date', exact: true }).fill('2026-09-01')
  await page.getByRole('button', { name: 'Log missed', exact: true }).click()
  await page.getByRole('heading', { name: 'Active Workout', exact: true }).waitFor()
  const workout = db.workouts.find(item => !item.completed_at)
  assert(workout.started_at.startsWith('2026-09-01'))
  await page.getByRole('button', { name: 'Finish Workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save Workout', exact: true }).click()
  await until(() => workout.completed_at !== null, 'Missed session should persist')
  await page.goto(`${BASE}/history/2026-09-01`)
  await page.getByRole('heading', { name: 'Workout History', exact: true }).waitFor()
  await until(async () => (await page.locator('body').innerText()).includes('1 completed workout'), 'Missed session should count on chosen date')
  await qa.capture('backdated-workout')
})

await scenario('replace preserves completed work and reorder survives reload', { active: true }, async ({ page, card, db }) => {
  await page.goto(`${BASE}/workout/active`)
  await card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1).waitFor()
  const originalWE = db.workout_exercises.find(item => item.workout_id === ACTIVE && item.exercise_id === db.exercises[0].id)
  const originalDone = db.workout_sets.filter(item => item.workout_exercise_id === originalWE.id && item.is_completed).map(item => item.id)
  await card(NAMES[0]).getByRole('button', { name: 'Replace', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: `Add ${NAMES[4]}`, exact: true }).click()
  await until(() => db.workout_exercises.filter(item => item.workout_id === ACTIVE).length === 6, 'Replacement should append when completedwork exists')
  assert(originalDone.every(id => db.workout_sets.some(item => item.id === id)))
  await card(NAMES[0]).getByRole('button', { name: 'Move down', exact: true }).click()
  await until(() => originalWE.exercise_order > 0, 'Reorder should persist')
  await page.reload()
  await card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1).waitFor()
  assert(originalDone.every(id => db.workout_sets.some(item => item.id === id)))
})

await scenario('queued edit then delete cannot leave workout permanently blocked', { active: true }, async ({ page, card, db, qa }) => {
  await page.goto(`${BASE}/workout/active`)
  const weight = card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1)
  await weight.waitFor()
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')) })
  await weight.fill('145'); await weight.press('Tab')
  await weight.locator('..').getByRole('button', { name: 'Delete set', exact: true }).click()
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')) })
  await new Promise(resolve => setTimeout(resolve, 200))
  await page.getByRole('button', { name: 'Finish Workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save Workout', exact: true }).click()
  await until(() => db.workouts.find(item => item.id === ACTIVE).completed_at !== null, 'User should be able to finish after explicit deletion resolves queued edit')
})

await scenario('finishing while paused excludes current unresumed pause', { active: true }, async ({ page, db }) => {
  const workout = db.workouts.find(item => item.id === ACTIVE)
  const now = new Date(TEST_TIME).getTime()
  workout.started_at = new Date(now - 600000).toISOString()
  workout.paused_at = new Date(now - 300000).toISOString()
  workout.accumulated_pause_seconds = 60
  await page.goto(`${BASE}/workout/active`)
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Finish Workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save Workout', exact: true }).click()
  await until(() => workout.completed_at !== null, 'Pausedworkout shouldfinish')
  assert(workout.duration_seconds >= 238 && workout.duration_seconds <= 243, `Expected240active seconds; got${workout.duration_seconds}`)
})

await scenario('routine rest settings persist and snapshot into newly started session', {}, async ({ page, db, card }) => {
  await page.goto(`${BASE}/workout`)
  await page.getByRole('button', { name: 'Start Routine', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Open QA Routine options', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const rest = page.getByLabel('Rest seconds', { exact: true }).first()
  await rest.waitFor()
  await rest.fill('75')
  await page.getByRole('checkbox', { name: 'Rest timer', exact: true }).first().uncheck()
  await page.getByRole('button', { name: 'Save Routine', exact: true }).click()
  await until(() => db.routine_exercises.some(item => item.exercise_id === db.exercises[0].id && item.rest_seconds === 75 && item.timer_enabled === false), 'Routine restsettings shouldpersist')
  await page.goto(`${BASE}/workout`)
  await page.getByRole('button', { name: 'Start Routine', exact: true }).click()
  await card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).first().waitFor()
  const active = db.workouts.find(item => !item.completed_at)
  const snapshot = db.workout_exercises.find(item => item.workout_id === active.id && item.exercise_id === db.exercises[0].id)
  assert.equal(snapshot.rest_seconds, 75)
  assert.equal(snapshot.timer_enabled, false)
})

await scenario('routine deep-link reload retains all saved exercises', {}, async ({ page, db }) => {
  await page.goto(`${BASE}/routines/${db.routines[0].id}/edit`)
  await page.getByLabel('Rest seconds', { exact: true }).first().waitFor()
  assert.equal(await page.getByLabel('Rest seconds', { exact: true }).count(), 5)
})

await scenario('session observations and superset grouping survive reload', { active: true }, async ({ page, card, db }) => {
  await page.goto(`${BASE}/workout/active`)
  const bench = card(NAMES[0])
  await bench.getByPlaceholder('Session observation').fill('QA tempo stayed controlled')
  await bench.getByPlaceholder('Session observation').press('Tab')
  await until(() => db.workout_exercises[0].session_notes === 'QA tempo stayed controlled', 'Session observation should persist')
  await bench.getByRole('button', { name: 'Superset next', exact: true }).click()
  await until(() => Boolean(db.workout_exercises[0].superset_group), 'Superset should persist')
  await page.reload()
  await bench.getByRole('button', { name: 'Ungroup', exact: true }).waitFor()
  assert.equal(await bench.getByPlaceholder('Session observation').inputValue(), 'QA tempo stayed controlled')
  await bench.getByRole('button', { name: 'Ungroup', exact: true }).click()
  await until(() => db.workout_exercises[0].superset_group === null, 'Ungroup should persist')
})

await scenario('remove preserves completed exercise and removes a new uncompleted replacement', { active: true }, async ({ page, card, db }) => {
  await page.goto(`${BASE}/workout/active`)
  await card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1).waitFor()
  await card(NAMES[0]).getByRole('button', { name: 'Remove', exact: true }).click()
  await page.getByText('Completed work is preserved. Delete its sets before removing the exercise.', { exact: true }).waitFor()
  assert.equal(db.workout_exercises.filter(row => row.workout_id === ACTIVE).length, 5)
  await card(NAMES[0]).getByRole('button', { name: 'Replace', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: `Add ${NAMES[4]}`, exact: true }).click()
  await until(() => db.workout_exercises.filter(row => row.workout_id === ACTIVE).length === 6, 'Replacement should be added')
  const inserted = db.workout_exercises.find(row => row.workout_id === ACTIVE && !row.id.startsWith('40000000'))
  await page.locator(`#workout-exercise-${inserted.id}`).getByRole('button', { name: 'Remove', exact: true }).click()
  await until(() => !db.workout_exercises.some(row => row.id === inserted.id), 'Uncompleted replacement should be removed')
  assert.equal(db.workout_exercises.filter(row => row.workout_id === ACTIVE).length, 5)
})

if (reports.some(report => report.passed === false)) process.exitCode = 1
