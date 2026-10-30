/**
 * Screenshots of every LIFF screen on the backend-free mock, at phone size.
 *
 *   pnpm mock          # in one terminal (port 5199)
 *   pnpm shots         # in another; PNGs land in tests/visual/out/
 *
 * BASE=http://localhost:5199 and OUT=<dir> override the defaults. ONLY=<name
 * substring> shoots a subset. TALL=1 uses a 390 x 2400 window: the screens
 * scroll inside their own frame, so a phone-height shot shows the top only. The run starts by resetting the mock's state, and
 * exits non-zero when a page threw or logged a console error.
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? 'http://localhost:5199'
const OUT = process.env.OUT ?? path.join(HERE, 'out')
const ONLY = process.env.ONLY ?? ''
const HEIGHT = process.env.TALL === '1' ? 2400 : 844
const FIXTURE = path.resolve(HERE, '../../dev-mock/fixtures/yor.jpg')

/** [file name, persona, path] */
const PAGES = [
  ['o21-overview', 'owner', '/liff/app'],
  ['o22-ponds', 'owner', '/liff/app/ponds'],
  ['o22-ponds-urgent', 'owner', '/liff/app/ponds?f=urgent'],
  ['o22-ponds-edit', 'owner', '/liff/app/ponds/edit'],
  ['o23-pond-a04', 'owner', '/liff/app/ponds/p-a04'],
  ['o23-pond-d02-urgent', 'owner', '/liff/app/ponds/p-d02'],
  ['o23-pond-f10-missing', 'owner', '/liff/app/ponds/p-f10'],
  ['o24-stocking', 'owner', '/liff/app/ponds/p-a04/stocking'],
  ['e2-history-f10', 'owner', '/liff/app/ponds/p-f10/history'],
  ['e3-fix', 'owner', '/liff/app/scans/s-f10-1015/fix'],
  ['o39-team', 'owner', '/liff/app/team'],
  ['o40-member-ponds', 'owner', '/liff/app/people/m-ek/ponds?from=team'],
  ['o19-scan', 'owner', '/liff/app/scan'],
  ['o25-settings', 'owner', '/liff/app/settings'],
  ['o38-nets', 'owner', '/liff/app/nets'],
  ['o7-people', 'owner', '/liff/app/people'],
  ['o8-invite', 'owner', '/liff/app/people/invite'],
  ['o11-permissions', 'owner', '/liff/app/people/m-phon/permissions'],
  ['o11-permissions-manager', 'owner', '/liff/app/people/m-sak/permissions'],
  ['o32-print', 'owner', '/liff/app/print'],
  ['o33-print-farm', 'owner', '/liff/app/print/farm'],
  ['o34-print-pond', 'owner', '/liff/app/print/pond/p-a04'],
  ['me', 'owner', '/liff/app/me'],
  ['m-overview', 'manager', '/liff/app'],
  ['m-ponds', 'manager', '/liff/app/ponds'],
  ['m-team', 'manager', '/liff/app/team'],
  ['m-people', 'manager', '/liff/app/people'],
  ['m-scan', 'manager', '/liff/app/scan'],
  ['w23-today', 'worker', '/liff/app'],
  ['w17-scan', 'worker', '/liff/app/scan'],
  ['o2-start-candidate', 'new', '/liff/app'],
  ['w2-join', 'new', '/liff/app/join?invite=7K2P9QX'],
  ['o3-start-fresh', 'fresh', '/liff/app'],
  ['closed', 'worker', '/liff/app/closed?said=%E0%B8%AA%E0%B9%81%E0%B8%81%E0%B8%99%20F10%20%E0%B9%81%E0%B8%A5%E0%B9%89%E0%B8%A7'],
]

function withPersona(p, as) {
  return `${BASE}${p}${p.includes('?') ? '&' : '?'}as=${as}`
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  // Skeletons and the boot logo give way to content; give fonts a beat.
  await page.waitForTimeout(400)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const reset = await fetch(`${BASE}/api/mock/reset`, { method: 'POST' }).catch(() => null)
  if (!reset || !reset.ok) {
    console.error(`No mock at ${BASE}. Start it with \`pnpm mock\` first.`)
    process.exit(2)
  }

  const browser = await chromium.launch()
  const problems = []
  const ctx = await browser.newContext({ viewport: { width: 390, height: HEIGHT }, deviceScaleFactor: 2, locale: 'th-TH' })

  const watch = (page, name) => {
    page.on('pageerror', (e) => problems.push(`${name}: pageerror ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`${name}: console ${m.text()}`)
    })
  }

  for (const [name, as, p] of PAGES) {
    if (ONLY && !name.includes(ONLY)) continue
    const page = await ctx.newPage()
    watch(page, name)
    await page.goto(withPersona(p, as))
    await settle(page)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
    console.log(`shot ${name}  ${page.url().replace(BASE, '')}`)
    await page.close()
  }

  // เรื่องน่าจับตา on the owner home: a row opens in place, รับทราบ folds it
  // away with a เลิกทำ toast, the footer keeps who and when.
  if (!ONLY || ONLY === 'watch') {
    const page = await ctx.newPage()
    watch(page, 'watch')
    await page.goto(withPersona('/liff/app', 'owner'))
    await settle(page)
    await page.getByTestId('watch-row').first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, 'watch-1-open.png'), fullPage: true })
    await page.getByTestId('watch-ack').first().click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(OUT, 'watch-2-acked.png'), fullPage: true })
    await page.getByTestId('watch-acked-toggle').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, 'watch-3-footer.png'), fullPage: true })
    console.log('shot watch-1..3')
    await page.close()
  }

  // The scan itself, end to end (แบบ 2): owner on F10, its ยอ, the fixture photo, น้ำ's rim, measure.
  if (!ONLY || ONLY === 'flow') {
    const page = await ctx.newPage()
    watch(page, 'flow')
    await page.goto(withPersona('/liff/app/scan?pond=p-f10', 'owner'))
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'flow-1-net.png'), fullPage: true })
    await page.getByRole('button', { name: /^ถัดไป$/ }).click()
    await page.getByTestId('photo-file').waitFor({ state: 'attached', timeout: 15_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'flow-2-photo.png'), fullPage: true })
    await page.getByTestId('photo-file').setInputFiles(FIXTURE)
    await page.getByRole('button', { name: 'วัดเลย' }).waitFor({ timeout: 15_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'flow-3-rim.png'), fullPage: true })
    await page.getByRole('button', { name: 'วัดเลย' }).click()
    await page.waitForTimeout(1700)
    await page.screenshot({ path: path.join(OUT, 'flow-4-measuring.png'), fullPage: true })
    await page.getByRole('button', { name: /บันทึกเข้าบ่อ/ }).first().waitFor({ timeout: 20_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'flow-5-result.png'), fullPage: true })
    console.log('shot flow (5)')
    await page.close()
  }

  // A worker's scan: F10 from today's list, photo, rim, then send to the owner with no sizes, back to the list.
  if (!ONLY || ONLY === 'wflow') {
    const page = await ctx.newPage()
    watch(page, 'wflow')
    await page.goto(withPersona('/liff/app', 'worker'))
    await settle(page)
    await page.getByRole('button', { name: 'สแกนบ่อ F10' }).click()
    await page.getByTestId('photo-file').waitFor({ state: 'attached', timeout: 15_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'wflow-1-photo.png'), fullPage: true })
    await page.getByTestId('photo-file').setInputFiles(FIXTURE)
    await page.getByRole('button', { name: 'วัดเลย' }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: 'วัดเลย' }).click()
    await page.getByRole('button', { name: /^ส่งให้/ }).waitFor({ timeout: 20_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'wflow-2-send.png'), fullPage: true })
    await page.getByRole('button', { name: /^ส่งให้/ }).click()
    await page.getByText('สแกนครบ 10 บ่อแล้วค่ะ', { exact: false }).waitFor({ timeout: 15_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'wflow-3-done.png'), fullPage: true })
    console.log('shot wflow (3)')
    await page.close()
  }

  // Round 3: the calendar, แก้ไขโซนและบ่อ and its sheets, a zone named in onboarding.
  if (!ONLY || ONLY === 'round3') {
    const page = await ctx.newPage()
    watch(page, 'round3')
    await page.goto(withPersona('/liff/app/ponds/p-a04/stocking', 'owner'))
    await settle(page)
    await page.locator('.dp-f').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, 'r3-1-date-picker.png'), fullPage: true })

    await page.goto(withPersona('/liff/app/ponds/edit', 'owner'))
    await settle(page)
    const shotSheet = async (open, name) => {
      await open()
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(OUT, name), fullPage: true })
      await page.locator('.dim').click({ position: { x: 20, y: 20 } })
      await page.waitForTimeout(300)
    }
    await shotSheet(() => page.locator('.pe-zn').first().click(), 'r3-2-zone-name.png')
    await shotSheet(() => page.getByRole('button', { name: /^บ่อ A03/ }).click(), 'r3-3-pond-rename.png')
    await shotSheet(() => page.locator('.pe-more').first().click(), 'r3-4-add-ponds.png')
    await shotSheet(() => page.locator('.ob-add').click(), 'r3-5-add-zone.png')

    await page.goto(withPersona('/liff/app', 'fresh'))
    await settle(page)
    await page.getByLabel('รหัสเข้าร่วม').fill('BETA')
    await page.getByRole('button', { name: 'เริ่มใช้งาน' }).click()
    await page.getByLabel('ชื่อฟาร์ม').waitFor({ timeout: 10_000 })
    await page.getByLabel('ชื่อฟาร์ม').fill('ฟาร์มทดลอง')
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'r3-6-start-zones.png'), fullPage: true })
    await page.locator('.pe-zn').first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, 'r3-7-start-zone-name.png'), fullPage: true })
    console.log('shot round3 (7)')
    await page.close()
  }

  await browser.close()
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`)
    process.exit(1)
  }
  console.log(`\nAll shots in ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
