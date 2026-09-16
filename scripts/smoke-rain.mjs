/**
 * Placement + 雨. Fresh install: take the "I know N5" offer, open kanji rain,
 * catch a few, then throw the run to reach the summary. Screenshots each state.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   SHOT_DIR=/tmp/shots node scripts/smoke-rain.mjs
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
page.on('dialog', (d) => d.accept())

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await shot('20-home-placement')

await page.getByRole('button', { name: /start at N4/ }).click()
await page.waitForTimeout(800)
await shot('21-home-after-placement')

const kanji = await page.evaluate(() => fetch('./data/kanji.json').then((r) => r.json()))
const byMeaning = new Map(kanji.map((k) => [k.m[0], k.c]))

await page.getByRole('button', { name: /kanji rain/ }).click()
await page.waitForTimeout(500)
await shot('22-rain-ready')

await page.getByRole('button', { name: '降らせる' }).click()
await page.waitForTimeout(1800)
await shot('23-rain-playing')

/** Tap the drop showing `c` once it is inside the field. */
async function tapChar(c) {
  for (let i = 0; i < 80; i++) {
    const done = await page.evaluate((ch) => {
      const field = document.querySelector('.rain-lanes')
      if (!field) return 'nofield'
      const top = field.getBoundingClientRect().top
      for (const b of field.querySelectorAll('button')) {
        if (b.textContent !== ch || b.disabled) continue
        const r = b.getBoundingClientRect()
        if (r.top < top) return false
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        return true
      }
      return false
    }, c)
    if (done === 'nofield') return false
    if (done) return true
    await page.waitForTimeout(100)
  }
  return false
}

const prompt = () => page.locator('.rain-lanes ~ div span.font-ui').first().textContent()

let hits = 0
for (let wave = 0; wave < 4; wave++) {
  const m = await prompt()
  const target = byMeaning.get(m)
  if (!target) break
  if (await tapChar(target)) hits++
  await page.waitForTimeout(150)
  if (wave === 0) await shot('24-rain-hit')
  await page.waitForTimeout(700)
}
console.log('caught', hits)

// let one land untouched: the target sinks, the answer is shown, a life goes
await page.waitForTimeout(8500)
await shot('25-rain-landed')

// now throw it: tap whatever is not the target until the lives run out
let wrongShot = false
for (let i = 0; i < 12; i++) {
  const over = await page.getByRole('button', { name: 'もう一度' }).count()
  if (over) break
  const m = await prompt().catch(() => null)
  const target = m ? byMeaning.get(m) : null
  const tapped = await page.evaluate((t) => {
    const field = document.querySelector('.rain-lanes')
    if (!field) return false
    const top = field.getBoundingClientRect().top
    for (const b of field.querySelectorAll('button')) {
      if (b.disabled || b.textContent === t) continue
      if (b.getBoundingClientRect().top < top) continue
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      return true
    }
    return false
  }, target)
  if (tapped && !wrongShot) {
    wrongShot = true
    await page.waitForTimeout(200)
    await shot('25b-rain-wrong')
  }
  await page.waitForTimeout(tapped ? 1400 : 300)
}
await page.waitForTimeout(400)
await shot('26-rain-over')

// what did it write?
const rows = await page.evaluate(async () => {
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
  const items = await get('items')
  const reviews = await get('reviews')
  db.close()
  return {
    items: items.length,
    review: items.filter((i) => i.state === 2).length,
    relearning: items.filter((i) => i.state === 3).length,
    reviews: reviews.map((r) => `${r.c}:${r.mode}:${r.rating}`),
  }
})
console.log(JSON.stringify(rows))

await page.getByRole('button', { name: 'collection', exact: true }).click()
await page.waitForTimeout(500)
await shot('27-home-after-rain')

console.log('ERRORS:', errors.length ? errors : 'none')
await browser.close()
