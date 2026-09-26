import assert from 'node:assert/strict'
import { startHarness, BASE, fixture, NAMES, USER } from './harness.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD7sAAAAASUVORK5CYII=', 'base64')
const database = fixture()
database.exercises[0].image_url = '/api/exercise-images/qa-media?resolution=180'
database.exercises[0].thumbnail_url = database.exercises[0].image_url
let mediaRequests = 0
let uploadRequests = 0
let batchSignRequests = 0
const batchSignPaths = []
let abortUpload = false
const qa = await startHarness({ database, backend: async ({ entry, route, url, database, fulfill }) => {
  assert.match(route.request().headers().authorization ?? '', /^Bearer /, 'Media API requires authenticated request')
  if (url.pathname === '/api/exercise-images/qa-media') {
    mediaRequests += 1
    return route.fulfill({ status: 200, contentType: 'image/png', body: png })
  }
  if (url.pathname === '/api/progress-photos' && entry.method === 'POST') {
    if (abortUpload) return route.abort('connectionfailed')
    uploadRequests += 1
    const photo = { id: `photo-${uploadRequests}`, user_id: USER, measured_at: url.searchParams.get('measured_at'), storage_path: `${USER}/qa-photo-${uploadRequests}.jpg`, caption: null, created_at: new Date().toISOString() }
    database.progress_photos.push(photo)
    return fulfill(photo, 201)
  }
  if (url.pathname.startsWith('/api/progress-photos/') && entry.method === 'DELETE') {
    database.progress_photos = database.progress_photos.filter(photo => photo.id !== url.pathname.split('/').at(-1))
    return fulfill({ deleted: true })
  }
  qa.events.unexpected.push(entry)
  return route.abort()
} })
qa.page.setDefaultTimeout(6000)
const page = qa.page
const reports = []
async function check(name, action) {
  try { await action(); reports.push({ name, passed: true }) }
  catch (error) { reports.push({ name, passed: false, message: error.message }); await qa.capture(`media-failure-${reports.length}`) }
  console.log(JSON.stringify(reports.at(-1)))
}
await qa.context.route('https://example.supabase.co/storage/v1/**', async route => {
  const request = route.request()
  qa.events.requests.push({ method: request.method(), url: request.url(), body: request.postData() })
  const path = new URL(request.url()).pathname
  if (request.method() === 'POST' && path === '/storage/v1/object/sign/progress-photos') {
    batchSignRequests += 1
    const paths = JSON.parse(request.postData()).paths
    batchSignPaths.push(paths)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paths.slice(0, 2).reverse().map(item => ({ path: item, signedURL: `/object/sign/progress-photos/${item}?token=qa`, signedUrl: `/storage/v1/object/sign/progress-photos/${item}?token=qa` }))) })
  }
  if (request.method() === 'POST' && path.startsWith('/storage/v1/object/sign/progress-photos/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: path.replace('/storage/v1', '') + '?token=qa' }) })
  }
  if (request.method() === 'GET' && path.startsWith('/storage/v1/object/sign/progress-photos/')) {
    return route.fulfill({ status: 200, contentType: 'image/png', body: png })
  }
  qa.events.unexpected.push({ method: request.method(), url: request.url() })
  return route.abort()
})
try {
  await page.goto(`${BASE}/workout/active`)
  await page.getByText(NAMES[0], { exact: true }).first().waitFor()
  await check('ten exercise detail opens reuse one authenticated media request', async () => {
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: `Open ${NAMES[0]} details`, exact: true }).click()
      const image = page.getByRole('img', { name: `${NAMES[0]} demonstration`, exact: true })
      await image.waitFor()
      assert(await image.evaluate(image => image.complete && image.naturalWidth > 0))
      if (i === 0) await qa.capture('exercise-media')
      await page.getByRole('button', { name: 'Close exercise details', exact: true }).click()
    }
    assert.equal(mediaRequests, 1, 'Same media should be fetched only once across thumbnail and 10 detail opens')
  })
  await page.goto(`${BASE}/profile`)
  await page.getByRole('heading', { name: 'Private progress photos', exact: true }).waitFor()
  await check('private-photo upload renders returned signed image', async () => {
    await page.locator('input[type=file]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: png })
    await page.getByText('Private photo saved.', { exact: true }).waitFor()
    const image = page.getByRole('img', { name: /^Progress from/ })
    await image.waitFor()
    assert.equal(uploadRequests, 1)
    await image.scrollIntoViewIfNeeded()
    await qa.capture('private-photos')
  })
  await check('photo upload failure surfaces error without adding metadata', async () => {
    qa.failure.predicate = entry => entry.url.includes('/api/progress-photos')
    await page.locator('input[type=file]').setInputFiles({ name: 'qa-failed.png', mimeType: 'image/png', buffer: png })
    await page.getByText('Photo upload failed.', { exact: true }).waitFor()
    assert.equal(database.progress_photos.length, 1)
  })
  await check('photo can be deleted from private history', async () => {
    const photos = page.getByRole('heading', { name: 'Private progress photos', exact: true }).locator('xpath=ancestor::section[1]')
    await photos.getByRole('button', { name: 'Delete', exact: true }).click()
    for (let attempts = 0; attempts < 100 && database.progress_photos.length; attempts++) await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(database.progress_photos.length, 0)
    await photos.getByRole('img').waitFor({ state: 'detached' })
    assert.equal(await photos.getByRole('img').count(), 0)
  })
  await check('photo history signs multiple paths in one batch operation and preserves row order', async () => {
    const requestsBeforeReload = batchSignRequests
    const batchesBeforeReload = batchSignPaths.length
    database.progress_photos.push(
      { id: 'photo-a', user_id: USER, measured_at: '2026-09-03', storage_path: `${USER}/a.jpg`, caption: null, created_at: new Date().toISOString() },
      { id: 'photo-b', user_id: USER, measured_at: '2026-09-02', storage_path: `${USER}/b.jpg`, caption: null, created_at: new Date().toISOString() },
      { id: 'photo-c', user_id: USER, measured_at: '2026-09-01', storage_path: `${USER}/c.jpg`, caption: null, created_at: new Date().toISOString() },
    )
    await page.reload()
    const images = page.getByRole('img', { name: /^Progress from/ })
    await images.first().waitFor()
    assert(batchSignRequests > requestsBeforeReload)
    assert(batchSignPaths.slice(batchesBeforeReload).every(paths => paths.length === 3), 'Every StrictMode load should batch all photo paths')
    assert.equal(await images.count(), 2, 'A partial signing result should omit only the unsigned photo')
    assert.deepEqual(await images.evaluateAll(items => items.map(item => item.alt)), ['Progress from 2026-09-03', 'Progress from 2026-09-02'])
  })
  await check('photo connection loss is handled without an uncaught exception', async () => {
    abortUpload = true
    await page.locator('input[type=file]').setInputFiles({ name: 'qa-disconnected.png', mimeType: 'image/png', buffer: png })
    await new Promise(resolve => setTimeout(resolve, 250))
    assert.deepEqual(qa.events.errors, [])
    assert.match(await page.locator('body').innerText(), /Photo upload failed|Unable to upload|connection/i)
  })
  await check('zero unexpected app requests and no uncaught browser errors', async () => {
    assert.deepEqual(qa.events.unexpected, [])
    assert.deepEqual(qa.events.errors, [])
  })
} finally {
  qa.events.checks.push(...reports)
  await qa.close('media-results')
}

if (reports.some(report => report.passed === false)) process.exitCode = 1
