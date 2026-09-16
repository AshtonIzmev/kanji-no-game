/**
 * Arcade mode cannot be reached on day one — an item has to earn its way past
 * the graduation threshold first. This seeds mature FSRS state directly into
 * IndexedDB so the arcade layout can actually be looked at.
 *
 *   SHOT_DIR=/tmp/shots node scripts/smoke-arcade.mjs
 */
import { chromium, devices } from 'playwright'

const OUT = process.env.SHOT_DIR ?? '/tmp/shots'
const EXE = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// 30 mature, overdue words: state Review (2), stability well past the 3-day
// graduation threshold, so every one of them routes to arcade.
const seeded = await page.evaluate(async () => {
  const chars = await fetch('./data/vocab.json')
    .then((r) => r.json())
    .then((v) => v.slice(0, 30).map((x) => x.w))
  const req = indexedDB.open('kanji-no-game')
  const db = await new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const tx = db.transaction('items', 'readwrite')
  const store = tx.objectStore('items')
  const yesterday = new Date(Date.now() - 86400000)
  chars.forEach((w, i) =>
    store.put({
      w,
      due: yesterday,
      stability: 4 + i * 2,
      difficulty: 5,
      elapsed_days: 3,
      scheduled_days: 4,
      learning_steps: 0,
      reps: 4 + i,
      lapses: 0,
      state: 2,
      last_review: yesterday,
      presented: i,
    }),
  )
  await new Promise((res) => (tx.oncomplete = res))
  db.close()
  return chars.length
})
console.log('seeded', seeded, 'mature items')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: '始める' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/10-arcade.png` })

// build a combo so the centring cross fills
for (let i = 0; i < 6; i++) {
  const answer = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.grid.grid-cols-2 > button')]
    return btns.length
  })
  if (!answer) break
  // click every choice's index until one is right is not possible under a
  // clock; instead read the correct label out of the app's own render order
  await page.locator('.grid.grid-cols-2 > button').nth(i % 4).click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(600)
}
await page.screenshot({ path: `${OUT}/11-arcade-later.png` })

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
