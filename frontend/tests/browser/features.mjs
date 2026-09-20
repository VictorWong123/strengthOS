import assert from 'node:assert/strict'
import { startHarness, BASE, ACTIVE, NAMES } from './harness.mjs'

const qa = await startHarness()
qa.page.setDefaultTimeout(8000)
const page = qa.page
const report = []
async function check(name, action) {
  try {
    await action()
    report.push({ name, passed: true })
  } catch (error) {
    report.push({ name, passed: false, message: error.message })
    await qa.capture(`failure-${report.length}`)
  }
  console.log(JSON.stringify(report.at(-1)))
}
async function until(predicate, message, timeout = 4000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.fail(message)
}
async function offline(value) {
  await page.evaluate(value => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !value })
    window.dispatchEvent(new Event(value ? 'offline' : 'online'))
  }, value)
}
const card = name => page.getByText(name, { exact: true }).first().locator('xpath=ancestor::*[contains(@class,"space-y-4") and contains(@class,"border")][1]')
const benchSet = () => qa.database.workout_sets.find(row => row.id === '50000000-0000-4000-8000-000000000002')
const benchWeight = () => card(NAMES[0]).getByRole('textbox', { name: 'weight', exact: true }).nth(1)
async function fillAndBlur(locator, value) {
  await locator.fill(value)
  await locator.press('Tab')
}
try {
  await page.goto(`${BASE}/workout/active`)
  await benchWeight().waitFor()
  await check('all logging modes show appropriate primary inputs and targets', async () => {
    const fields = ['weight', 'reps', 'weight', 'assistance weight', 'duration seconds']
    for (let i = 0; i < NAMES.length; i++) {
      assert.equal(await card(NAMES[i]).getByRole('textbox', { name: fields[i], exact: true }).count(), 2)
      assert.match(await card(NAMES[i]).innerText(), /Target 8-12 @ RPE 8/)
    }
    assert.equal(await page.getByText('Actual RPE', { exact: true }).count(), 10)
    assert.equal(await page.getByRole('combobox', { name: 'Set type' }).count(), 10)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow at 390px')
    await qa.capture('active-modes')
  })
  await check('saved field changes reach RPC and retain server revision', async () => {
    await fillAndBlur(benchWeight(), '145')
    await until(() => benchSet().weight === 145, 'Weight should persist in mocked server')
    await until(async () => await benchWeight().inputValue() === '145', 'Saved value should remain in input')
    assert(qa.database.workouts.find(row => row.id === ACTIVE).revision > 0)
  })
  await check('rep-only, added-load, assistance and duration values persist with RPE and set type', async () => {
    const changes = [[1, 'reps', '10', 'reps'], [2, 'weight', '30', 'weight'], [3, 'assistance weight', '35', 'assistance_weight'], [4, 'duration seconds', '55', 'duration_seconds']]
    for (const [index, label, value, field] of changes) {
      await fillAndBlur(card(NAMES[index]).getByRole('textbox', { name: label, exact: true }).nth(1), value)
      const we = qa.database.workout_exercises.find(row => row.workout_id === ACTIVE && row.exercise_id === qa.database.exercises[index].id)
      await until(() => qa.database.workout_sets.find(row => row.workout_exercise_id === we.id && row.set_order === 1)[field] === Number(value), `${label} should persist`)
    }
    await card(NAMES[1]).getByRole('combobox', { name: 'Set type', exact: true }).nth(1).selectOption('failure')
    await fillAndBlur(card(NAMES[1]).getByRole('textbox', { name: 'Actual RPE', exact: true }).nth(1), '8.5')
    const row = qa.database.workout_sets.find(row => row.id === '50000000-0000-4000-8000-000000000012')
    await until(() => row.rpe === 8.5 && row.set_type === 'failure', 'Actual effort and explicit type should save')
    await page.reload()
    await until(async () => await card(NAMES[4]).getByRole('textbox', { name: 'duration seconds', exact: true }).nth(1).inputValue() === '55', 'Timed value should survive reload')
  })
  await check('rest deadline supports +15/-15, reload and skip', async () => {
    await card(NAMES[0]).getByRole('button', { name: 'Mark set complete', exact: true }).click()
    await page.getByText('Rest timer running', { exact: true }).waitFor()
    const key = `strengthos:rest:${ACTIVE}`
    const first = Number(await page.evaluate(key => localStorage.getItem(key), key))
    await page.getByRole('button', { name: 'Add 15 seconds', exact: true }).click()
    await until(async () => Number(await page.evaluate(key => localStorage.getItem(key), key)) === first + 15000, '+15 updates deadline')
    await page.getByRole('button', { name: 'Subtract 15 seconds', exact: true }).click()
    await until(async () => Number(await page.evaluate(key => localStorage.getItem(key), key)) === first, '-15 updates deadline')
    await page.reload()
    await page.getByText('Rest timer running', { exact: true }).waitFor()
    assert.equal(Number(await page.evaluate(key => localStorage.getItem(key), key)), first)
    await page.getByRole('button', { name: 'Skip rest timer', exact: true }).click()
    await until(async () => await page.getByText('Rest timer running', { exact: true }).count() === 0, 'Skip removes timer')
  })
  await check('failed save survives reload and retries without duplicate operation', async () => {
    qa.failure.predicate = entry => entry.url.includes('/rpc/save_workout_set')
    qa.failure.once = false
    await fillAndBlur(benchWeight(), '155')
    await until(async () => (await page.locator('body').innerText()).includes('Save failed'), 'Failed save should be visible')
    assert.equal(benchSet().weight, 145)
    await page.reload()
    await page.getByText(NAMES[0], { exact: true }).first().waitFor()
    await until(async () => await benchWeight().inputValue() === '155', 'Unsaved draft should survive reload')
    qa.failure.predicate = null
    await offline(true)
    await offline(false)
    await until(() => benchSet().weight === 155, 'Recovered network should persist queued edit')
  })
  await check('concurrent server change does not silently overwrite queued draft', async () => {
    await offline(true)
    await fillAndBlur(benchWeight(), '165')
    const serverWorkout = qa.database.workouts.find(row => row.id === ACTIVE)
    serverWorkout.revision += 1
    benchSet().weight = 160
    await offline(false)
    await until(async () => (await page.locator('body').innerText()).match(/conflict|changed elsewhere/i), 'Conflict should be visible')
    assert.equal(benchSet().weight, 160, 'Server value must stay unchanged')
    await page.reload()
    await page.getByText(NAMES[0], { exact: true }).first().waitFor()
    await until(async () => (await page.locator('body').innerText()).match(/conflict|changed elsewhere|review/i), 'Conflict should remain reviewable after reload')
    await qa.capture('conflict-review')
  })
  await check('history correction changes name and duration without errors', async () => {
    await page.goto(`${BASE}/history`)
    await page.getByText('QA History 16', { exact: true }).first().click()
    await page.getByRole('textbox', { name: 'Workout name', exact: true }).fill('QA Corrected History')
    await page.getByRole('textbox', { name: 'Workout duration minutes', exact: true }).fill('35')
    await page.getByRole('button', { name: 'Save corrections', exact: true }).click()
    await until(() => qa.database.workouts.some(row => row.name === 'QA Corrected History' && row.duration_seconds === 2100), 'History correction should persist')
    await qa.capture('history-corrections')
  })
  await check('all requests mocked and no browser exceptions', async () => {
    assert.deepEqual(qa.events.unexpected, [])
    assert.deepEqual(qa.events.errors, [])
  })
} finally {
  qa.events.checks.push(...report)
  await qa.close('feature-results')
}

if (report.some(result => result.passed === false)) process.exitCode = 1
