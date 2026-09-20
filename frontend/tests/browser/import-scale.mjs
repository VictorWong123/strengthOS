import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, USER } from './harness.mjs'

const db = fixture()
const originalWorkout = db.workouts[1]
const originalExercise = db.workout_exercises[5]
const originalSet = db.workout_sets[10]
db.workouts = Array.from({ length: 107 }, (_, index) => ({ ...originalWorkout, id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: `QA Scale Session ${index}`, user_id: USER }))
db.workout_exercises = db.workouts.flatMap((workout, wi) => Array.from({ length: 3 }, (_, ei) => ({ ...originalExercise, id: `91000000-0000-4000-8000-${String(wi * 3 + ei + 1).padStart(12, '0')}`, workout_id: workout.id, exercise_id: db.exercises[0].id, exercise_order: ei })))
db.workout_sets = db.workout_exercises.flatMap((we, wi) => Array.from({ length: 12 }, (_, si) => ({ ...originalSet, id: `92000000-0000-4000-8000-${String(wi * 12 + si + 1).padStart(12, '0')}`, workout_exercise_id: we.id, set_order: si, set_type: 'working', weight: 100, reps: 10, is_completed: true })))
const qa = await startHarness({ database: db })
qa.page.setDefaultTimeout(6000)
const reports = []
try {
  await qa.page.goto(`${BASE}/history`)
  await qa.page.getByText('QA Scale Session 0', { exact: true }).first().waitFor()
  await qa.page.getByText('QA Scale Session 0', { exact: true }).first().click()
  await qa.page.getByRole('dialog').waitFor()
  const complete = qa.page.getByRole('dialog').getByText('Completed sets', { exact: true }).locator('..')
  for (let attempts = 0; attempts < 100 && !(await complete.innerText()).includes('36'); attempts++) await new Promise(resolve => setTimeout(resolve, 30))
  assert.match(await complete.innerText(), /36/, 'Each session should show all36sets after completeinitialload')
  const setCalls = qa.events.requests.filter(request => request.url.includes('/rest/v1/workout_sets?'))
  assert(setCalls.some(call => Number(new URL(call.url).searchParams.get('offset')) === 1000), 'A set page beyond1000 should be fetched')
  const inLists = setCalls.map(call => new URL(call.url).searchParams.get('workout_exercise_id'))
  assert(inLists.every(value => !value || value.split(',').length <= 100), 'Child IDs should be batched to100orless')
  assert(Math.max(...setCalls.map(call => call.url.length)) < 6000, 'Request URLs must stay belowproxy URI limits')
  reports.push({ name: 'initial history batches321exerciseIDs and paginates3852sets', passed: true, setRequests: setCalls.length, maxUrlLength: Math.max(...setCalls.map(call => call.url.length)) })
  await qa.page.goto(`${BASE}/exercises`)
  await qa.page.getByText(db.exercises[0].name, { exact: true }).first().click()
  const modal = qa.page.getByRole('dialog')
  await modal.getByRole('heading', { name: 'Exercise history', exact: true }).waitFor()
  const metric = modal.getByText('Sets', { exact: true }).locator('..')
  assert.match(await metric.innerText(), /3852/, 'Exercise-specifichistory mustload all3852sets')
  const allSetCalls = qa.events.requests.filter(request => request.url.includes('/rest/v1/workout_sets?'))
  assert(Math.max(...allSetCalls.map(call => call.url.length)) < 6000, 'Exercisehistory mustalso batchIDs')
  reports.push({ name: 'exercise details retains all3852sets with bounded URLs', passed: true })
  await qa.capture('import-scale-history')
  assert.deepEqual(qa.events.unexpected, [])
  assert.deepEqual(qa.events.errors, [])
} catch (error) {
  reports.push({ name: 'import-scale history coverage', passed: false, message: error.message })
  await qa.capture('import-scale-failure')
} finally {
  qa.events.checks.push(...reports)
  await qa.close('import-scale-results')
  reports.forEach(report => console.log(JSON.stringify(report)))
}

if (reports.some(report => report.passed === false)) process.exitCode = 1
