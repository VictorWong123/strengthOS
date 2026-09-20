import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { startHarness, BASE, ROOT, ACTIVE, NAMES } from './harness.mjs'

const reports = []
async function until(predicate, message, timeout = 3500) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.fail(message)
}
async function scenario(name, action) {
  if (process.env.QA_ONLY && !name.includes(process.env.QA_ONLY)) return
  const qa = await startHarness()
  qa.page.setDefaultTimeout(6000)
  await qa.context.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => localStorage.getItem('qa-offline') !== '1' })
  })
  const page = qa.page
  const card = page.getByText(NAMES[0], { exact: true }).first().locator('xpath=ancestor::section[1]')
  const weight = card.getByRole('textbox', { name: 'weight', exact: true }).nth(1)
  const row = () => qa.database.workout_sets.find(set => set.id === '50000000-0000-4000-8000-000000000002')
  const workout = () => qa.database.workouts.find(workout => workout.id === ACTIVE)
  const offline = async value => page.evaluate(value => {
    localStorage.setItem('qa-offline', value ? '1' : '0')
    window.dispatchEvent(new Event(value ? 'offline' : 'online'))
  }, value)
  const edit = async value => { await weight.fill(value); await weight.press('Tab') }
  const countRequests = () => qa.events.requests.filter(request => request.url.includes('/rpc/save_workout_set')).length
  try {
    await page.goto(`${BASE}/workout/active`)
    await weight.waitFor()
    await action({ qa, page, card, weight, row, workout, offline, edit, countRequests })
    assert.deepEqual(qa.events.unexpected, [])
    assert.deepEqual(qa.events.errors, [])
    reports.push({ name, passed: true })
  } catch (error) {
    reports.push({ name, passed: false, message: error.message })
    await qa.capture(`recovery-${reports.length}-failure`)
  } finally {
    qa.events.checks.push(reports.at(-1))
    await qa.close(`recovery-${reports.length}-results`)
    console.log(JSON.stringify(reports.at(-1)))
  }
}

await scenario('queued original revision survives reload before replay', async ({ qa, page, weight, row, workout, offline, edit, countRequests }) => {
  await offline(true)
  await edit('165')
  await until(async () => (await page.locator('body').innerText()).includes('Saving'), 'Pending state expected')
  workout().revision = 1
  row().weight = 160
  await page.reload()
  await page.getByText(NAMES[0], { exact: true }).first().waitFor()
  await offline(false)
  await until(() => countRequests() >= 1, 'Queued edit should be retried')
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(row().weight, 160, 'Newer server value must not be overwritten by pre-reload draft')
  await until(async () => (await page.locator('body').innerText()).match(/changed elsewhere|conflict|Apply mine/i), 'Conflict must be reviewable')
})

await scenario('first conflict blocks remaining queued edits for workout', async ({ qa, page, card, row, workout, offline, edit, countRequests }) => {
  await offline(true)
  await edit('145')
  await card.getByRole('textbox', { name: 'Actual RPE', exact: true }).nth(1).fill('9')
  await card.getByRole('textbox', { name: 'Actual RPE', exact: true }).nth(1).press('Tab')
  workout().revision = 1
  row().weight = 160
  await offline(false)
  await until(() => countRequests() >= 1, 'First replay expected')
  await new Promise(resolve => setTimeout(resolve, 400))
  assert.equal(row().rpe, null, 'Later queued edit must wait for explicit conflict resolution')
  assert.equal(row().weight, 160)
  await page.reload()
  await page.getByText(NAMES[0], { exact: true }).first().waitFor()
  await page.getByRole('button', { name: 'Keep latest', exact: true }).waitFor()
})

await scenario('finish is blocked while saved fields remain pending or failed', async ({ qa, page, workout, edit, countRequests }) => {
  qa.failure.predicate = request => request.url.includes('/rpc/save_workout_set')
  qa.failure.once = false
  await edit('145')
  await until(() => countRequests() >= 1, 'Failed write expected')
  await page.getByRole('button', { name: 'Finish Workout', exact: true }).click()
  await page.getByRole('button', { name: /Save Workout|Save workout|Finish and save/i }).click()
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(workout().completed_at, null, 'Workout must not finish while set is unconfirmed')
  assert.match(await page.locator('body').innerText(), /pending|retry|unsaved|conflict/i)
})

await scenario('lost acknowledgement retries original operation without duplicate revision', async ({ qa, page, row, workout, offline, edit, countRequests }) => {
  qa.mutationControl.loseNextResponse = true
  await edit('145')
  await until(() => countRequests() === 1 && row().weight === 145, 'Server applied edit once')
  await until(async () => (await page.locator('body').innerText()).match(/failed|retry/i), 'Client should retain unacknowledged edit')
  const revision = workout().revision
  await offline(true)
  await offline(false)
  await until(() => countRequests() >= 2, 'Same mutation should retry')
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(workout().revision, revision, 'Idempotent retry must not increment again')
  const calls = qa.events.requests.filter(request => request.url.includes('/rpc/save_workout_set'))
  assert.equal(calls[0].body.p_operation_id, calls[1].body.p_operation_id)
})

await scenario('older acknowledgement cannot replace a newer unsaved edit', async ({ qa, page, row, weight, edit, countRequests }) => {
  qa.mutationControl.delayMs = 350
  qa.failure.predicate = request => request.url.includes('/rpc/save_workout_set') && request.body?.p_patch?.weight === 155
  qa.failure.once = false
  await edit('145')
  await edit('155')
  await until(() => countRequests() >= 2 && row().weight === 145, 'First edit succeeds and second fails')
  await until(async () => (await page.locator('body').innerText()).match(/failed|retry/i), 'Second edit must remain pending')
  assert.equal(await weight.inputValue(), '155', 'Older acknowledgement must not reset latest155draft to145')
  await page.reload()
  await weight.waitFor()
  await until(async () => await weight.inputValue() === '155', 'Latest queued draft must be visible after reload')
})

await scenario('queued edits stay isolated after logout and a different account signs in', async ({ qa, page, edit, countRequests }) => {
  qa.failure.predicate = request => request.url.includes('/rpc/save_workout_set')
  qa.failure.once = false
  await edit('145')
  await until(() => countRequests() === 1, 'One edit queued for accountA')
  await page.goto(`${BASE}/profile`)
  const switchingSession = await page.evaluate(() => JSON.parse(localStorage.getItem('sb-example-auth-token')))
  await page.getByRole('button', { name: 'Logout', exact: true }).click()
  await page.waitForFunction(() => localStorage.getItem('sb-example-auth-token') === null)
  const before = countRequests()
  qa.failure.predicate = null
  qa.database.workouts = []
  qa.database.workout_exercises = []
  qa.database.workout_sets = []
  qa.database.routines = []
  qa.database.routine_exercises = []
  await page.evaluate(session => {
    session.user.id = '10000000-0000-4000-8000-000000000099'
    session.user.email = 'qa-other@example.test'
    const claims = { sub: session.user.id, aud: 'authenticated', role: 'authenticated', exp: 2208988800 }
    session.access_token = session.access_token.split('.')[0] + '.' + btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') + '.qa'
    localStorage.setItem('sb-example-auth-token', JSON.stringify(session))
  }, switchingSession)
  await page.goto(`${BASE}/workout/active`)
  await page.getByText('No active workout', { exact: true }).waitFor()
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sb-example-auth-token')).user.id), '10000000-0000-4000-8000-000000000099')
  const laterCalls = qa.events.requests.filter(request => request.url.includes('/rpc/save_workout_set')).slice(before)
  assert.equal(laterCalls.filter(request => request.actor === '10000000-0000-4000-8000-000000000099').length, 0, 'AccountB must not replay accountA queued edits')
})

await scenario('workout notes remain recoverable after a failed save and reload', async ({ qa, page }) => {
  qa.failure.predicate = request => request.url.endsWith('/rpc/save_workout')
  qa.failure.once = false
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true })
  await notes.fill('QA offline workout note')
  await notes.press('Tab')
  await until(() => qa.events.requests.some(request => request.url.endsWith('/rpc/save_workout')), 'Workout note save should be attempted')
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(await notes.inputValue(), 'QA offline workout note', 'Failed workout-note save must not discard draft')
  await page.reload()
  await notes.waitFor()
  await until(async () => await notes.inputValue() === 'QA offline workout note', 'Workout note should survive reload while still unsaved')
})

await scenario('invalid effort can be corrected without trapping the workout outbox', async ({ qa, page, card, row }) => {
  const effort = card.getByRole('textbox', { name: 'Actual RPE', exact: true }).nth(1)
  await effort.fill('11'); await effort.press('Tab')
  await new Promise(resolve => setTimeout(resolve, 150))
  await effort.fill('8'); await effort.press('Tab')
  await until(() => row().rpe === 8, 'Correcting an invalid RPE should save the valid value')
  await page.reload()
  await effort.waitFor()
  await until(async () => await effort.inputValue() === '8', 'Corrected RPE should remain visible after reload')
})

await writeFile(`${ROOT}/recovery-report.json`, JSON.stringify(reports, null, 2))

if (reports.some(report => report.passed === false)) process.exitCode = 1
