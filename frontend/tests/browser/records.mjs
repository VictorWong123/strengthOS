import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, ACTIVE, NAMES } from './harness.mjs'
const reports = []
async function until(predicate, message) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  assert.fail(message)
}
async function scenario(name, database, action) {
  if (process.env.QA_ONLY && !name.includes(process.env.QA_ONLY)) return
  const qa = await startHarness({ database }); qa.page.setDefaultTimeout(6000)
  try { await action(qa); assert.deepEqual(qa.events.unexpected, []); assert.deepEqual(qa.events.errors, []); reports.push({ name, passed: true }) }
  catch (error) { reports.push({ name, passed: false, message: error.message }); await qa.capture(`records-${reports.length}-failure`) }
  finally { qa.events.checks.push(reports.at(-1)); await qa.close(`records-${reports.length}-results`); console.log(JSON.stringify(reports.at(-1))) }
}
async function openExercise(page, name) {
  await page.goto(`${BASE}/exercises`)
  await page.getByText(name, { exact: true }).first().click()
  await page.getByRole('heading', { name: 'Exercise history', exact: true }).waitFor()
  return page.getByRole('dialog')
}
const unknown = fixture()
for (const we of unknown.workout_exercises.filter(row => row.exercise_id === unknown.exercises[2].id && row.workout_id !== ACTIVE)) {
  for (const set of unknown.workout_sets.filter(row => row.workout_exercise_id === we.id)) set.weight = null
}
await scenario('unknown imported added load is not displayed as zero load', unknown, async ({ page, capture }) => {
  const dialog = await openExercise(page, NAMES[2])
  const text = await dialog.innerText()
  assert.doesNotMatch(text, /\b0 lb(?: added)?\s*[×x]/i)
  assert.match(text, /unknown|not recorded|unrecorded|—/i)
  await capture('unknown-added-load')
})
const sameDay = fixture()
sameDay.workouts[2].started_at = '2026-09-16T18:00:00.000Z'
sameDay.workouts[2].completed_at = '2026-09-16T18:45:00.000Z'
await scenario('exercise history opens the exact source session among two on one date', sameDay, async ({ page, capture }) => {
  const dialog = await openExercise(page, NAMES[0])
  await dialog.getByRole('button', { name: /QA History 12/ }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name', exact: true }).waitFor()
  assert.equal(await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name', exact: true }).inputValue(), 'QA History 12')
  await capture('exact-source-history')
})
const estimates = fixture()
for (const we of estimates.workout_exercises.filter(row => row.exercise_id === estimates.exercises[0].id && row.workout_id !== ACTIVE)) {
  const rows = estimates.workout_sets.filter(row => row.workout_exercise_id === we.id)
  rows[0].weight = 100; rows[0].reps = 10; rows[0].set_type = 'working'
  rows[1].weight = 110; rows[1].reps = 1; rows[1].set_type = 'working'
}
await scenario('session estimated maximum uses best estimate and exposes a trend', estimates, async ({ page, capture }) => {
  const dialog = await openExercise(page, NAMES[0])
  const headline = dialog.getByText('Est. 1RM', { exact: true }).locator('..')
  assert.match(await headline.innerText(), /133/)
  const text = await dialog.innerText()
  assert.match(text, /9\/16\/2026[^\n]*est\. 1RM 133(?:\.\d+)? lb/i, 'Per-session estimate must select100x10 rather than110x1')
  await dialog.getByRole('heading', { name: /(?:estimated|est\.).*1RM.*trend|1RM trend/i }).waitFor()
  await capture('estimated-strength-trend')
})
const assistedWarmup = fixture()
for (const we of assistedWarmup.workout_exercises.filter(row => row.exercise_id === assistedWarmup.exercises[3].id && row.workout_id !== ACTIVE)) {
  const first = assistedWarmup.workout_sets.find(row => row.workout_exercise_id === we.id && row.set_order === 0)
  first.set_type = 'warmup'; first.assistance_weight = 5; first.reps = 30
}
await scenario('assisted warmups cannot suppress a working-set assistance record', assistedWarmup, async ({ page, database }) => {
  await page.goto(`${BASE}/workout/active`)
  const card = page.getByText(NAMES[3], { exact: true }).first().locator('xpath=ancestor::section[1]')
  const assist = card.getByRole('textbox', { name: 'assistance weight', exact: true }).nth(1)
  await assist.fill('30'); await assist.press('Tab')
  await until(() => database.workout_sets.find(row => row.id === '50000000-0000-4000-8000-000000000032').assistance_weight === 30, 'New assistance must save')
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await page.getByText(/New personal record/).waitFor()
})
const completedWarmup = fixture()
const warmupRow = completedWarmup.workout_sets.find(row => row.id === '50000000-0000-4000-8000-000000000032')
warmupRow.set_type = 'warmup'; warmupRow.assistance_weight = 1; warmupRow.reps = 20
await scenario('completing an assisted warmup never announces a working-set record', completedWarmup, async ({ page, database }) => {
  await page.goto(`${BASE}/workout/active`)
  const card = page.getByText(NAMES[3], { exact: true }).first().locator('xpath=ancestor::section[1]')
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(() => database.workout_sets.find(row => row.id === warmupRow.id).is_completed, 'Warmup completion should save')
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(await page.getByText(/New personal record/).count(), 0, 'Completed warmup cannot announce a working record')
})
if (reports.some(report => report.passed === false)) process.exitCode = 1
