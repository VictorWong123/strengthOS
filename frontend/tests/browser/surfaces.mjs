import assert from 'node:assert/strict'
import { startHarness, BASE, NAMES, USER, fixture } from './harness.mjs'

const db = fixture()
db.exercises.push({ ...db.exercises[0], id: '30000000-0000-4000-8000-000000000006', name: 'QA Untrained Curl', primary_muscle: 'biceps', secondary_muscles: [] })
db.body_measurements.push({ id: '95000000-0000-4000-8000-000000000001', user_id: USER, measured_at: '2026-09-18', bodyweight: 170, waist: 33 })
const qa = await startHarness({ database: db })
qa.page.setDefaultTimeout(6000)
const page = qa.page
const reports = []
const card = name => page.getByText(name, { exact: true }).first().locator('xpath=ancestor::section[1]')
async function check(name, action) {
  try { await action(); reports.push({ name, passed: true }) }
  catch (error) { reports.push({ name, passed: false, message: error.message }); await qa.capture(`surfaces-failure-${reports.length}`) }
  console.log(JSON.stringify(reports.at(-1)))
}
async function until(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  assert.fail(message)
}
try {
  await page.goto(`${BASE}/analytics`)
  await page.getByText('Weekly muscle workload', { exact: true }).waitFor()
  await qa.capture('analytics')
  await check('weekly workload includes bodyweight/time work and separate secondary sets', async () => {
    const text = await card('Weekly muscle workload').innerText()
    assert.match(text, /abdominals/)
    assert.match(text, /biceps0 sessions?/)
    assert.match(text, /0 primary · 0 secondary/)
    assert.match(text, /2 primary/)
    assert.match(text, /secondary/)
    assert.match(text, /Last trained/i)
    assert.match(text, /previous week|last week|week.over.week/i, 'Week-to-week comparison expected')
  })
  await page.goto(`${BASE}/profile`)
  await page.getByRole('heading', { name: 'Measurements', exact: true }).waitFor()
  await check('measurement entry persists and creates trend', async () => {
    await page.getByRole('textbox', { name: 'Weight (lb)', exact: true }).fill('172.5')
    await page.getByRole('textbox', { name: 'Waist (in)', exact: true }).fill('32')
    await page.getByRole('button', { name: 'Save measurement', exact: true }).click()
    await until(() => qa.database.body_measurements.some(row => row.bodyweight === 172.5 && row.waist === 32 && row.user_id === USER), 'Measurement should persist')
    await page.getByText('172.5 lb', { exact: true }).waitFor()
  })
  await page.getByRole('heading', { name: 'Measurements', exact: true }).scrollIntoViewIfNeeded()
  await qa.capture('profile-measurements')
  await check('measurement history supports correction and weekly average', async () => {
    const text = await card('Measurements').innerText()
    assert.match(text, /7-day average: 171.3 lb/, 'Weekly average should combine both dated weights')
    assert.match(text, /edit|delete/i, 'Measurement correction controls expected')
    await card('Measurements').getByRole('button', { name: 'Delete', exact: true }).first().click()
    await until(() => qa.database.body_measurements.length === 1, 'Measurement deletion should persist')
  })
  await check('signed-in support and privacy controls open public pages', async () => {
    await page.getByRole('button', { name: 'Privacy', exact: true }).click()
    await page.getByRole('heading', { name: 'Privacy', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/privacy')
    await page.getByRole('button', { name: 'Get support', exact: true }).click()
    await page.getByRole('heading', { name: 'Support', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/support')
    await page.goto(`${BASE}/profile`)
    await page.getByRole('heading', { name: 'Measurements', exact: true }).waitFor()
  })
  await page.goto(`${BASE}/workout/active`)
  await page.getByText(NAMES[0], { exact: true }).first().waitFor()
  await card(NAMES[0]).scrollIntoViewIfNeeded()
  await qa.capture('logger-viewport-detail')
  await check('exercise management controls have mobile touch targets', async () => {
    const bounds = []
    for (const name of ['Move up', 'Move down', 'Replace', 'Remove']) {
      const box = await card(NAMES[0]).getByRole('button', { name, exact: true }).boundingBox()
      bounds.push({ name, width: box.width, height: box.height })
    }
    reports.push({ name: 'exercise management bounds', bounds })
    assert(bounds.every(box => box.width >= 44 && box.height >= 44), JSON.stringify(bounds))
  })
  await check('personal cues and prior exercise-session notes persist', async () => {
    await card(NAMES[0]).getByRole('button', { name: `Open ${NAMES[0]} details`, exact: true }).click()
    await page.getByPlaceholder('Grip, seat, stance, or tempo').fill('QA grip shoulder width')
    await page.getByRole('button', { name: 'Save cue', exact: true }).click()
    await until(() => qa.database.exercise_cues.some(row => row.cue === 'QA grip shoulder width'), 'Personal cue should persist')
    await page.getByRole('button', { name: 'Close exercise details', exact: true }).click()
    assert.match(await card(NAMES[0]).innerText(), /Previous note: Previous exercise observation/)
  })
  await check('custom bar warm-up preview matches inserted sets', async () => {
    await card(NAMES[0]).getByText('Plate & warm-up calculator', { exact: true }).click()
    await page.getByRole('textbox', { name: 'Bar weight', exact: true }).fill('100')
    await page.getByRole('textbox', { name: 'Available plates per side', exact: true }).fill('10,5')
    const preview = await card(NAMES[0]).locator('details').innerText()
    assert.match(preview, /Per side: 10 \+ 5 · loaded 130 lb/)
    await qa.capture('calculator')
    const before = qa.database.workout_sets.length
    await page.getByRole('button', { name: 'Add warm-up sets', exact: true }).click()
    await until(() => qa.database.workout_sets.length > before, 'Warm-up insertion should persist')
    const inserted = qa.database.workout_sets.slice(before).map(row => `${row.weight}×${row.reps}`)
    assert(inserted.every(pair => preview.includes(pair)), `Preview: ${preview}; inserted: ${inserted.join(', ')}`)
  })
  await check('workout pause and resume persist', async () => {
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor()
    await until(() => qa.database.workouts[0].paused_at !== null, 'Pause should persist')
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await until(() => qa.database.workouts[0].paused_at === null, 'Resume should persist')
  })
  await check('negative calculator input does not crash app', async () => {
    await page.getByRole('textbox', { name: 'Target weight', exact: true }).fill('-1')
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(qa.events.errors.length, 0, 'Invalid calculator input must show validation')
    assert(await page.getByRole('heading', { name: 'Active Workout', exact: true }).isVisible())
  })
  await check('all app requests intercepted', async () => assert.deepEqual(qa.events.unexpected, []))
} finally {
  qa.events.checks.push(...reports)
  await qa.close('surfaces-results')
}

if (reports.some(report => report.passed === false)) process.exitCode = 1
