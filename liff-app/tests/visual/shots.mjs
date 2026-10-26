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
  ['o23-pond-a04', 'owner', '/liff/app/ponds/p-a04'],
  ['o23-pond-d02-urgent', 'owner', '/liff/app/ponds/p-d02'],
  ['o23-pond-f10-missing', 'owner', '/liff/app/ponds/p-f10'],
  ['o24-stocking', 'owner', '/liff/app/ponds/p-a04/stocking'],
  ['e2-history-f10', 'owner', '/liff/app/ponds/p-f10/history'],
  ['e3-fix', 'owner', '/liff/app/scans/s-f10-1015/fix'],
  ['o13-inbox', 'owner', '/liff/app/inbox'],
  ['o14-measure', 'owner', '/liff/app/inbox/measure?ids=s-f09-in,s-f07-in'],
  ['o19-scan', 'owner', '/liff/app/scan'],
  ['o25-settings', 'owner', '/liff/app/settings'],
  ['o38-nets', 'owner', '/liff/app/nets'],
  ['o7-people', 'owner', '/liff/app/people'],
  ['o8-invite', 'owner', '/liff/app/people/invite'],
  ['o11-permissions', 'owner', '/liff/app/people/m-phon/permissions'],
  ['o32-print', 'owner', '/liff/app/print'],
  ['o33-print-farm', 'owner', '/liff/app/print/farm'],
  ['o34-print-pond', 'owner', '/liff/app/print/pond/p-a04'],
  ['me', 'owner', '/liff/app/me'],
  ['w23-today', 'worker', '/liff/app'],
  ['w17-scan', 'worker', '/liff/app/scan'],
  ['w11-pick-pond', 'worker', '/liff/app/pick-pond'],
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

  // The scan itself, end to end: owner on F10, the fixture photo, น้ำ's rim, measure.
  if (!ONLY || ONLY === 'flow') {
    const page = await ctx.newPage()
    watch(page, 'flow')
    await page.goto(withPersona('/liff/app/scan?pond=p-f10', 'owner'))
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'flow-1-photo.png'), fullPage: true })
    await page.getByTestId('photo-file').setInputFiles(FIXTURE)
    await page.getByRole('button', { name: 'วัดเลย' }).waitFor({ timeout: 15_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'flow-2-rim.png'), fullPage: true })
    await page.getByRole('button', { name: 'วัดเลย' }).click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: path.join(OUT, 'flow-3-measuring.png'), fullPage: true })
    await page.getByRole('button', { name: /บันทึกเข้าบ่อ/ }).first().waitFor({ timeout: 20_000 })
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'flow-4-result.png'), fullPage: true })
    console.log('shot flow (4)')
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
