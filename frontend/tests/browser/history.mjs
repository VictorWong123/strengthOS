import assert from 'node:assert/strict'
import { startHarness, BASE, NAMES } from './harness.mjs'

const qa = await startHarness()
const { page, database } = qa
page.setDefaultTimeout(6000)
const reports = []
async function until(predicate, message) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  assert.fail(message)
}
async function check(name, action) {
  try { await action(); reports.push({ name, passed: true }) }
  catch (error) { reports.push({ name, passed: false, message: error.message }); await qa.capture(`history-${reports.length}-failure`) }
  console.log(JSON.stringify(reports.at(-1)))
}
try {
  await page.goto(`${BASE}/history`)
  await page.getByText('QA History 16', { exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Workout name', exact: true }).waitFor()
  await check('completed-session date, notes, duration, weight, reps and RPE corrections persist', async () => {
    const weight = dialog.getByRole('textbox', { name: 'Weight', exact: true }).first()
    const reps = dialog.getByRole('textbox', { name: 'Reps', exact: true }).first()
    const effort = dialog.getByRole('textbox', { name: 'RPE', exact: true }).first()
    for (const [input, value] of [[weight, '150'], [reps, '10'], [effort, '9']]) { await input.fill(value); await input.press('Tab') }
    const row = database.workout_sets.find(set => set.id === '50000000-0000-4000-8000-000000000051')
    await until(() => row.weight === 150 && row.reps === 10 && row.rpe === 9, 'Completed set changes should persist')
    await dialog.getByRole('textbox', { name: 'Workout date', exact: true }).fill('2026-09-15')
    await dialog.getByRole('textbox', { name: 'Workout notes', exact: true }).fill('QA corrected observation')
    await dialog.getByRole('textbox', { name: 'Workout duration minutes', exact: true }).fill('30')
    await dialog.getByRole('button', { name: 'Save corrections', exact: true }).click()
    const workout = database.workouts[1]
    await until(() => workout.notes === 'QA corrected observation' && workout.duration_seconds === 1800 && workout.started_at.startsWith('2026-09-15'), 'Metadata corrections should persist')
    await page.goto(`${BASE}/history/2026-09-15`)
    await page.getByText('QA History 16', { exact: true }).first().click()
    await until(async () => await dialog.getByRole('textbox', { name: 'Weight', exact: true }).first().inputValue() === '150', 'History should reload corrected set')
    await qa.capture('corrected-history-fields')
  })
  await check('completed assisted sets expose assistance correction', async () => {
    const assisted = dialog.getByRole('heading', { name: NAMES[3], exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]')
    const input = assisted.getByRole('textbox', { name: /Assistance|Assist weight/i }).first()
    await input.waitFor()
    await input.fill('35'); await input.press('Tab')
    await until(() => database.workout_sets.find(set => set.id === '50000000-0000-4000-8000-000000000081').assistance_weight === 35, 'Assistance correction should persist')
  })
  await check('history correction requests remain mocked and error-free', async () => {
    assert.deepEqual(qa.events.unexpected, [])
    assert.deepEqual(qa.events.errors, [])
  })
} finally {
  qa.events.checks.push(...reports)
  await qa.close('history-results')
}
if (reports.some(report => report.passed === false)) process.exitCode = 1
