/**
 * Manual smoke driver: walks a session in an iPhone viewport and screenshots
 * each state. Not a test suite — a way to look at the thing.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   SHOT_DIR=/tmp/shots node scripts/smoke.mjs
 */
import { chromium, devices } from 'playwright'

const OUT = process.env.SHOT_DIR ?? '/tmp/shots'
const EXE = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await shot('01-home')

await page.getByRole('button', { name: '始める' }).click()
await page.waitForTimeout(600)
await shot('02-encounter-study')

let feedbackShots = 0
let probeShots = 0
for (let step = 0; step < 60; step++) {
  const study = page.getByRole('button', { name: '覚えた' })
  if ((await study.count()) && (await study.first().isEnabled())) {
    await study.first().click()
    await page.waitForTimeout(200)
    if (probeShots++ === 0) await shot('03-probe')
    continue
  }
  const next = page.getByRole('button', { name: '次へ' })
  if (await next.count()) {
    if (feedbackShots++ === 0) await shot('04-encounter-feedback')
    await next.first().click()
    await page.waitForTimeout(200)
    continue
  }
  const choices = page.locator('.grid.grid-cols-2 > button:not([disabled])')
  if (await choices.count()) {
    await choices.nth(step % 4).click()
    await page.waitForTimeout(300)
    continue
  }
  if (await page.getByRole('button', { name: 'collection' }).count()) break
  await page.waitForTimeout(300)
}

await shot('05-late-session')

const quit = page.getByRole('button', { name: 'end session' })
if (await quit.count()) {
  await quit.click()
  await page.waitForTimeout(700)
}
await shot('06-summary')

const home = page.getByRole('button', { name: 'collection' })
if (await home.count()) {
  await home.first().click()
  await page.waitForTimeout(600)
}
await shot('07-home-after')

const cell = page.locator('.grid.grid-cols-7 > button').first()
if (await cell.count()) {
  await cell.click()
  await page.waitForTimeout(400)
}
await shot('08-kanji-sheet')

const back = page.getByRole('button', { name: '← collection' })
if (await back.count()) {
  await back.click()
  await page.waitForTimeout(400)
}
const streak = page.getByRole('button', { name: /day streak/ })
if (await streak.count()) {
  await streak.click()
  await page.waitForTimeout(400)
}
await shot('09-stats')

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
