import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, NAMES, ACTIVE } from './harness.mjs'

const reports = []
async function until(predicate, message, timeout = 4000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 30)) }
  assert.fail(message)
}
async function scenario(name, modify, action) {
  const db = fixture(); modify?.(db)
  const qa = await startHarness({ database: db })
  const page = qa.page; page.setDefaultTimeout(6000)
  const card = name => page.getByText(name, { exact: true }).first().locator('xpath=ancestor::section[1]')
  try {
    await page.goto(`${BASE}/workout/active`)
    await page.getByText(NAMES[0], { exact: true }).first().waitFor()
    await card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1).waitFor()
    await action({ qa, page, card, db })
    assert.deepEqual(qa.events.unexpected, [])
    assert.deepEqual(qa.events.errors, [])
    reports.push({ name, passed: true })
  } catch (error) {
    reports.push({ name, passed: false, message: error.message }); await qa.capture(`progress-${reports.length}-failure`)
  } finally { qa.events.checks.push(reports.at(-1)); await qa.close(`progress-${reports.length}-results`); console.log(JSON.stringify(reports.at(-1))) }
}

await scenario('finish summary includes all working modes and excludes warmups', null, async ({ page, qa }) => {
  await page.getByRole('button', { name: 'Finish Workout', exact: true }).click()
  const text = await page.getByRole('dialog', { name: 'Finish Workout', exact: true }).innerText()
  await qa.capture('finish-summary')
  assert.match(text, /Sets\s+4\b/i, 'Four completed working sets across supported modes expected')
  assert.match(text, /(?:Loaded|Lifted)\s+0 lb/i, 'Ordinary loaded volume excludes added-bodyweight and warmup sets')
})

await scenario('dated timed history shows record and links back to source session', null, async ({ page, card, qa }) => {
  await card(NAMES[4]).getByRole('button', { name: `Open ${NAMES[4]} details`, exact: true }).click()
  await page.getByRole('heading', { name: 'Exercise history', exact: true }).waitFor()
  const dialog = page.getByRole('dialog')
  assert.match(await dialog.innerText(), /45s/)
  const metric = dialog.getByText('Best', { exact: true }).locator('..')
  assert.match(await metric.innerText(), /45s/, 'Overall best timed record should use duration')
  await qa.capture('exercise-duration-history')
  await dialog.getByRole('button', { name: /QA History 16/ }).click()
  await until(() => page.url().includes('/history/workout/20000000-0000-4000-8000-000000000002'), 'History link should point to exact source session')
})

await scenario('progression evidence produces advice; incomplete effort suppresses it', db => {
  for (const we of db.workout_exercises.filter(we => we.exercise_id === db.exercises[0].id && we.workout_id !== ACTIVE)) {
    for (const set of db.workout_sets.filter(set => set.workout_exercise_id === we.id)) { set.set_type = 'working'; set.reps = 12; set.rpe = 8; set.weight = 135 }
  }
}, async ({ page, card, qa }) => {
  assert.match(await card(NAMES[0]).innerText(), /Increase load by 5 lb/)
  await card(NAMES[0]).getByLabel('Load step (lb)').fill('2.5')
  assert.match(await card(NAMES[0]).innerText(), /Increase load by 2.5 lb/)
  assert.match(await card(NAMES[0]).innerText(), /Evidence:.*135.*12.*RPE 8.*135.*12.*RPE 8/)
  await qa.capture('progression-advice')
  assert.equal(await card(NAMES[4]).getByText('Next session:', { exact: true }).count(), 0, 'Timed sets have no rep progression advice')
})

await scenario('superset alternates without rest until group round ends', null, async ({ page, card, qa }) => {
  await card(NAMES[1]).getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(() => qa.database.workout_sets.find(set => set.id === '50000000-0000-4000-8000-000000000012').is_completed, 'First grouped set confirmed')
  assert.equal(await page.getByText('Rest timer running', { exact: true }).count(), 0, 'First group exercise should advance without rest')
  await card(NAMES[2]).getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await page.getByText('Rest timer running', { exact: true }).waitFor()
})

await scenario('live PR appears only after successful save', null, async ({ page, card, qa }) => {
  const target = card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1)
  await target.fill('200'); await target.press('Tab')
  await until(() => qa.database.workout_sets.find(set => set.id === '50000000-0000-4000-8000-000000000002').weight === 200, 'New weight confirmed')
  qa.failure.predicate = request => request.url.includes('/rpc/save_workout_set') && request.body?.p_patch?.is_completed
  qa.failure.once = false
  await card(NAMES[0]).getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(async () => (await page.locator('body').innerText()).includes('Save failed'), 'Failure expected')
  assert.equal(await page.getByText(/New personal record/).count(), 0, 'Failed completion cannot announce record')
  qa.failure.predicate = null
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')) })
  await page.reload()
  await page.getByText(/New personal record/).waitFor()
  await qa.capture('live-pr')
})

await scenario('PR alerts can be disabled persistently without blocking saved records', null, async ({ page, card, qa }) => {
  await page.getByRole('button', { name: 'PR alerts on', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'PR alerts off', exact: true }).waitFor()
  const target = card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1)
  await target.fill('200'); await target.press('Tab')
  await until(() => qa.database.workout_sets[1].weight === 200, 'PR weight should save')
  await card(NAMES[0]).getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(() => qa.database.workout_sets[1].is_completed, 'PR set should complete')
  assert.equal(await page.getByText(/New personal record/).count(), 0)
})
if (reports.some(report => report.passed === false)) process.exitCode = 1
