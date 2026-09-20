import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, NAMES, ACTIVE } from './harness.mjs'

const reports = []
async function until(predicate, message, timeout = 3000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 30)) }
  assert.fail(message)
}
async function scenario(name, modify, action) {
  const database = fixture()
  modify?.(database)
  const qa = await startHarness({ database })
  qa.page.setDefaultTimeout(5000)
  await qa.context.addInitScript(() => {
    window.__qaWake = { requested: 0, released: 0 }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      window.__qaWake.requested++
      return { release: async () => { window.__qaWake.released++ } }
    } } })
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { localStorage.setItem('qa-vibrations', String(Number(localStorage.getItem('qa-vibrations') ?? 0) + 1)); return true } })
    window.AudioContext = class {
      destination = {}
      currentTime = 0
      createGain() { return { gain: { set value(value) { localStorage.setItem('qa-gain', String(value)) } }, connect: () => ({}) } }
      createOscillator() { return { frequency: { value: 0 }, connect: gain => gain, start: () => localStorage.setItem('qa-audio', String(Number(localStorage.getItem('qa-audio') ?? 0) + 1)), stop() {}, addEventListener() {} } }
      close() { return Promise.resolve() }
    }
  })
  const page = qa.page
  const card = page.getByText(NAMES[0], { exact: true }).first().locator('xpath=ancestor::section[1]')
  try {
    await page.goto(`${BASE}/workout/active`)
    await page.getByText(NAMES[0], { exact: true }).first().waitFor()
    await action({ qa, page, card, database })
    assert.deepEqual(qa.events.unexpected, [])
    assert.deepEqual(qa.events.errors, [])
    reports.push({ name, passed: true })
  } catch (error) {
    reports.push({ name, passed: false, message: error.message })
    await qa.capture(`timers-${reports.length}-failure`)
  } finally { qa.events.checks.push(reports.at(-1)); await qa.close(`timers-${reports.length}-results`); console.log(JSON.stringify(reports.at(-1))) }
}

await scenario('rest settings open at inherited duration and session override survives reload', null, async ({ page, card }) => {
  await card.getByRole('button', { name: /Set rest for/ }).click()
  const seconds = page.getByRole('listbox', { name: 'Sec', exact: true })
  assert.equal(await seconds.getByRole('option', { selected: true }).innerText(), '00', 'Sheet should open at inherited60seconds, not global90')
  await page.getByRole('listbox', { name: 'Min', exact: true }).getByRole('option', { name: '00', exact: true }).click()
  await seconds.getByRole('option', { name: '03', exact: true }).click()
  await page.getByRole('button', { name: 'Set', exact: true }).click()
  await page.reload()
  await page.getByText(NAMES[0], { exact: true }).first().waitFor()
  assert.match(await card.getByRole('button', { name: /Set rest for/ }).getAttribute('aria-label'), /0:03/)
})

await scenario('timer-off prevents automatic countdown', db => { db.workout_exercises[0].timer_enabled = false }, async ({ page, card }) => {
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(await page.getByText('Rest timer running', { exact: true }).count(), 0)
})

await scenario('drop set suppresses automatic rest', db => { db.workout_sets[1].set_type = 'drop' }, async ({ page, card }) => {
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(await page.getByText('Rest timer running', { exact: true }).count(), 0)
})

await scenario('one completion sound and vibration; reload does not replay expired alert', db => { db.workout_exercises[0].rest_seconds = 1 }, async ({ page, card }) => {
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(async () => Number(await page.evaluate(() => localStorage.getItem('qa-audio'))) === 1, 'Timer completion should trigger one sound')
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-audio'))), 1)
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-vibrations'))), 1)
  await page.reload()
  await page.getByText(NAMES[0], { exact: true }).first().waitFor()
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-audio'))), 1)
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-vibrations'))), 1)
  assert.equal(await page.evaluate(id => localStorage.getItem(`strengthos:rest:${id}`), ACTIVE), null)
})

await scenario('wake-lock reacquires after visibility loss and releases on navigation', null, async ({ page }) => {
  await page.getByRole('button', { name: 'Keep awake', exact: true }).click()
  await until(async () => await page.evaluate(() => window.__qaWake.requested) === 1, 'Wake-lock request expected')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await until(async () => await page.evaluate(() => window.__qaWake.requested) >= 2, 'Visible workout should reacquire released wake-lock')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await until(async () => await page.evaluate(() => window.__qaWake.released) >= 1, 'Navigation should release wake-lock')
})

await scenario('timer volume and vibration/mute choices survive reload and govern completion', db => { db.workout_exercises[0].rest_seconds = 1 }, async ({ page, card, database }) => {
  await page.getByRole('slider', { name: 'Alert volume', exact: true }).fill('0.35')
  await page.getByRole('button', { name: 'Vibration on', exact: true }).click()
  await page.getByRole('button', { name: 'Sound on', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Vibration off', exact: true }).waitFor()
  assert.equal(await page.getByRole('slider', { name: 'Alert volume', exact: true }).inputValue(), '0.35')
  await page.getByRole('button', { name: 'Muted', exact: true }).waitFor()
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await page.getByText('Rest timer running', { exact: true }).waitFor()
  await until(async () => await page.getByText('Rest timer running', { exact: true }).count() === 0, 'Muted timer should finish')
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-audio'))), 0)
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-vibrations'))), 0)
  await card.getByRole('button', { name: 'Mark set incomplete', exact: true }).nth(1).click()
  await until(() => database.workout_sets[1].is_completed === false, 'Set should be reset before checking sound')
  await page.getByRole('button', { name: 'Muted', exact: true }).click()
  await card.getByRole('button', { name: 'Mark set complete', exact: true }).click()
  await until(async () => Number(await page.evaluate(() => localStorage.getItem('qa-audio'))) === 1, 'Timer completion should trigger one sound')
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-gain'))), 0.35)
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('qa-vibrations'))), 0)
})
if (reports.some(report => report.passed === false)) process.exitCode = 1
