import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, ACTIVE, NAMES } from './harness.mjs'
const reports = []
async function until(predicate, message) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  assert.fail(message)
}
async function scenario(name, options, action) {
  const qa = await startHarness(options); qa.page.setDefaultTimeout(6000)
  try { await action(qa); assert.deepEqual(qa.events.unexpected, []); assert.deepEqual(qa.events.errors, []); reports.push({ name, passed: true }) }
  catch (error) { reports.push({ name, passed: false, message: error.message }); await qa.capture(`analytics-boundary-${reports.length}-failure`) }
  finally { qa.events.checks.push(reports.at(-1)); await qa.close(`analytics-boundary-${reports.length}-results`); console.log(JSON.stringify(reports.at(-1))) }
}
const baseline = fixture()
for (const we of baseline.workout_exercises.filter(row => row.exercise_id === baseline.exercises[0].id)) {
  const first = baseline.workout_sets.find(set => set.workout_exercise_id === we.id && set.set_order === 0)
  first.set_type = 'warmup'; first.weight = 900
  if (we.workout_id === ACTIVE) { first.set_type = 'working'; first.weight = 999 }
}
await scenario('history charts and Home pounds exclude active sets, warmups and added-bodyweight volume', { database: baseline }, async ({ page, capture }) => {
  await page.goto(`${BASE}/analytics`)
  await page.getByRole('combobox', { name: 'Exercise', exact: true }).selectOption(baseline.exercises[0].id)
  const metric = label => page.getByText(label, { exact: true }).first().locator('..')
  await until(async () => /135 lb/.test(await metric('Max Weight').innerText()), 'Historical max should ignore active999 and warmup900')
  assert.match(await metric('Best Volume').innerText(), /1,215/)
  await capture('analytics-filtered-history')
  await page.goto(`${BASE}/`)
  await until(async () => /1,215/.test(await metric('Pounds Lifted').innerText()), 'Home pounds must only include historical ordinary working weight135x9')
})
const warmupBaseline = fixture()
for (const we of warmupBaseline.workout_exercises.filter(row => row.exercise_id === warmupBaseline.exercises[0].id && row.workout_id !== ACTIVE)) {
  const first = warmupBaseline.workout_sets.find(set => set.workout_exercise_id === we.id && set.set_order === 0)
  first.set_type = 'warmup'; first.weight = 900
}
await scenario('historical warmups cannot suppress a valid live working-set PR', { database: warmupBaseline }, async ({ page, database }) => {
  await page.goto(`${BASE}/workout/active`)
  const bench = page.getByText(NAMES[0], { exact: true }).first().locator('xpath=ancestor::section[1]')
  const weight = bench.getByRole('textbox', { name: 'weight', exact: true }).nth(1)
  await weight.fill('140'); await weight.press('Tab')
  await until(() => database.workout_sets[1].weight === 140, 'Weight should save')
  await bench.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await page.getByText(/New personal record/).waitFor()
})
const assistance = fixture()
for (const we of assistance.workout_exercises.filter(row => row.exercise_id === assistance.exercises[3].id && row.workout_id === assistance.workouts[2].id)) {
  for (const set of assistance.workout_sets.filter(row => row.workout_exercise_id === we.id)) set.assistance_weight = 30
}
await scenario('assistance record selects the lower assistance across completed sessions', { database: assistance }, async ({ page }) => {
  await page.goto(`${BASE}/analytics`)
  await page.getByRole('combobox', { name: 'Exercise', exact: true }).selectOption(assistance.exercises[3].id)
  const metric = page.getByText('Least assistance', { exact: true }).locator('..')
  await until(async () => /30 lb assist/.test(await metric.innerText()), 'Best assistance must be30, not40')
})
const dates = fixture()
const sourceWorkouts = dates.workouts.slice(1)
dates.workouts = sourceWorkouts.map((row, i) => ({ ...row, started_at: `2026-09-13T0${i + 3}:00:00.000Z`, completed_at: `2026-09-13T0${i + 3}:30:00.000Z` }))
dates.workout_exercises = dates.workouts.map((workout, i) => ({ ...dates.workout_exercises[5], id: `40000000-0000-4000-8000-0000000000${i + 1}1`, workout_id: workout.id }))
dates.workout_sets = dates.workout_exercises.map((we, i) => ({ ...dates.workout_sets[10], id: `50000000-0000-4000-8000-0000000000${i + 1}1`, workout_exercise_id: we.id, weight: 135, reps: 8, set_type: 'working' }))
await scenario('New York Sunday week stays consistent in Tokyo near midnight', { database: dates, timezone: 'Asia/Tokyo', testTime: '2026-09-20T00:30:00.000Z' }, async ({ page, capture }) => {
  await page.goto(`${BASE}/analytics`)
  const row = page.getByText('pectorals', { exact: true }).locator('xpath=ancestor::div[contains(@class,"grid")][1]')
  await until(async () => /1 primary/.test(await row.innerText()), 'SundayNY session should remain in current NYweek despite TokyoSunday')
  assert.match(await row.innerText(), /Previous week 1/)
  await page.goto(`${BASE}/`)
  const pounds = page.getByText('Pounds Lifted', { exact: true }).locator('..')
  await until(async () => /1,080/.test(await pounds.innerText()), 'Home week must match NY workload week')
  await capture('new-york-week-in-tokyo')
})
const unknownAssistance = fixture()
for (const we of unknownAssistance.workout_exercises.filter(row => row.exercise_id === unknownAssistance.exercises[3].id && row.workout_id !== ACTIVE)) {
  for (const set of unknownAssistance.workout_sets.filter(row => row.workout_exercise_id === we.id)) set.assistance_weight = null
}
await scenario('unknown assistance renders safely while genuine zero assistance remains a valid record', { database: unknownAssistance }, async ({ page, database, capture }) => {
  await page.goto(`${BASE}/analytics`)
  await page.getByRole('combobox', { name: 'Exercise', exact: true }).selectOption(unknownAssistance.exercises[3].id)
  await page.getByText('Least assistance', { exact: true }).waitFor()
  assert.doesNotMatch(await page.locator('body').innerText(), /Infinity|NaN/)
  assert.doesNotMatch((await page.locator('svg path').evaluateAll(paths => paths.map(path => path.getAttribute('d')).join(' '))), /Infinity|NaN/)
  await capture('unknown-assistance-analytics')
  const we = database.workout_exercises.find(row => row.exercise_id === unknownAssistance.exercises[3].id && row.workout_id !== ACTIVE)
  database.workout_sets.find(row => row.workout_exercise_id === we.id).assistance_weight = 0
  await page.reload()
  await page.getByRole('combobox', { name: 'Exercise', exact: true }).selectOption(unknownAssistance.exercises[3].id)
  const metric = page.getByText('Least assistance', { exact: true }).locator('..')
  await until(async () => /0 lb assist/.test(await metric.innerText()), 'Recorded zero assistance must remain a valid record')
  assert.doesNotMatch(await page.locator('body').innerText(), /Infinity|NaN/)
})
if (reports.some(report => report.passed === false)) process.exitCode = 1
