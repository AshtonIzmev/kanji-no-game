/**
 * The v1 database held one card per kanji. Open the app over such a database
 * and check that it comes up clean: kanji rows gone, streak kept, no errors.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/smoke-migrate.mjs
 */
import { chromium, devices } from 'playwright'

const EXE = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()
const errors = []

// Build a v1 database by hand before the app ever opens it. Dexie stores its
// version as indexedDB version × 10.
// a same-origin page that runs none of the app's code
await page.goto('http://localhost:4173/data/clusters.json', { waitUntil: 'load' })
await page.evaluate(async () => {
  await new Promise((res) => {
    const del = indexedDB.deleteDatabase('kanji-no-game')
    del.onsuccess = del.onerror = del.onblocked = () => res()
  })
  const req = indexedDB.open('kanji-no-game', 10)
  req.onupgradeneeded = () => {
    const db = req.result
    db.createObjectStore('items', { keyPath: 'c' }).createIndex('due', 'due')
    db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true }).createIndex('c', 'c')
    db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true }).createIndex('day', 'day')
    db.createObjectStore('meta', { keyPath: 'key' })
  }
  const db = await new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const tx = db.transaction(['items', 'reviews', 'meta'], 'readwrite')
  tx.objectStore('items').put({ c: '日', due: new Date(), stability: 5, difficulty: 5, state: 2, reps: 3, lapses: 0, presented: 3 })
  tx.objectStore('reviews').put({ c: '日', at: new Date(), rating: 3, correct: 1, kind: 'recognise', mode: 'arcade', ms: 900 })
  tx.objectStore('meta').put({ key: 'streak:count', value: 4 })
  tx.objectStore('meta').put({ key: 'new:2026-09-15', value: 7 })
  tx.objectStore('meta').put({ key: 'known:5', value: 'x' })
  await new Promise((res) => (tx.oncomplete = res))
  db.close()
})

// only the app's own run counts; the setup page above has no favicon
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const streak = await page.locator('header button').first().textContent()

const after = await page.evaluate(async () => {
  const req = indexedDB.open('kanji-no-game')
  const db = await new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const get = (store) =>
    new Promise((res) => {
      const r = db.transaction(store).objectStore(store).getAll()
      r.onsuccess = () => res(r.result)
    })
  const out = {
    version: db.version,
    itemsKeyPath: db.transaction('items').objectStore('items').keyPath,
    items: (await get('items')).length,
    reviews: (await get('reviews')).length,
    meta: (await get('meta')).map((m) => m.key).sort(),
  }
  db.close()
  return out
})
console.log(JSON.stringify(after), 'header:', streak?.trim())
console.log('ERRORS:', errors.length ? errors : 'none')
await browser.close()
