/**
 * The mock farm: in-memory state behind `pnpm mock`, typed against the LIFF
 * contract (src/api/types.ts), so a contract change breaks this file at
 * `tsc` time instead of drifting.
 *
 * One store per dev server. Writes (a scan saved, a ยอ added, an invite) stick
 * until the server restarts. Who is calling comes from the persona header.
 */
import type {
  AskAgainReason,
  FarmCandidate,
  FarmRef,
  FarmSheet,
  FixResponse,
  GrowthPoint,
  InboxResponse,
  Invite,
  InviteAccept,
  InviteCreate,
  InvitePreview,
  MeasureResponse,
  Member,
  MemberPondsResponse,
  MembersResponse,
  Net,
  NetCreate,
  NetEdit,
  NetShape,
  NotifySettings,
  Overview,
  PermissionKey,
  Permissions,
  PermissionsPatch,
  PermissionsResponse,
  PondDetail,
  PondScansResponse,
  PondSheet,
  PondStatus,
  PondTile,
  PondsResponse,
  Pt,
  QueueRow,
  Role,
  SaveResponse,
  Scan,
  ScanResult,
  ScanSummary,
  Session,
  SettingsResponse,
  StartRequest,
  Stocking,
  TeamDay,
  TeamPond,
  TeamTodayResponse,
  TodayResponse,
  WatchAck,
  WatchItem,
} from '../src/api/types'
import { NET_CM_MAX, NET_CM_MIN } from '../src/api/types'
import { addDays, daysBetween, fmtDay, fmtDayYear, fmtTime, pondRange } from '../src/lib/format'
import { centredGuess, fitEllipse, fitRim, insideRim, rimArea, rimBox } from '../src/lib/rim'
import { isLighter, weightStats } from '../src/lib/sizes'
import { ACTIVITY, CANDIDATE, DOTS, F10_HISTORY, FIXED, FIXTURE_ASPECT, GUESS, NOTES, PEOPLE, SQ_DOTS, SQ_FIXED, SQ_GUESS, STOCKED, TODAY, Z2, at, nowIso } from './story'

export type Persona = 'owner' | 'manager' | 'worker' | 'new' | 'fresh'

/** The LINE pictures the mock hands out (`/mock-avatars/:id`); the people left out show their letter. */
const PICTURES = new Set(['m-wichai', 'm-sak', 'm-chat', 'm-ek'])
const pictureOf = (id: string) => (PICTURES.has(id) ? `/mock-avatars/${id}` : null)
const zoneOfCode = (code: string) => /^[A-Za-z]+/.exec(code)?.[0]?.toUpperCase() ?? '1'

export class MockError extends Error {
  readonly status: number
  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

/* ---------- small helpers ---------- */

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Seeded random, so every restart tells the same story. */
function rng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(r: () => number): number {
  const u = Math.max(1e-9, r())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

/** Length from weight, the usual whiteleg curve: W = 0.0086 L³. */
function lengthOf(g: number): number {
  return round1(Math.cbrt(g / 0.0086))
}

function ellipseArea(rim: Pt[]): number {
  const e = fitEllipse(rim)
  return e ? Math.PI * e.rx * e.ry : 0
}

/**
 * How weight moves with the rim: a ring drawn wider than the floor edge makes
 * every shrimp look smaller. Calibrated so the fixture's wide guess reads
 * 13.9 g where the true rim reads 17.2 g (F10 in the story, W21 to E5).
 */
const RIM_EXP = Math.log(13.9 / 17.2) / Math.log(ellipseArea(FIXED) / ellipseArea(GUESS))

/** The area the rim marks for this ยอ shape: a ring, or a 4-corner frame. */
function rimAreaOf(shape: NetShape, rim: Pt[]): number {
  const r = fitRim(shape, rim)
  return r ? rimArea(r) : 0
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** The fixture photos in dev-mock/fixtures, by name. */
const FIXTURE_SIZE: Record<string, { width: number; height: number }> = {
  yor: { width: 520, height: 461 },
  'ok-good': { width: 260, height: 231 },
  'bad-cut': { width: 260, height: 231 },
}

/* ---------- state ---------- */

interface MPond {
  id: string
  code: string
  zone: string
  /** Today's real average weight: what a well-placed rim measures. */
  trueAbw: number
  gPerDay: number
  kind: 'r' | 'g' | 'w' | 'u' | 'm'
  cv: number
  split: boolean
  stockedOn: string | null
  count: number | null
  survival: number | null
  netId: string | null
  /** Saved weights before the scans in `scans`, oldest first. */
  past: { date: string; abw: number }[]
  note: { by: string; at: string; text: string } | null
}

interface MMember {
  id: string
  name: string
  role: Role
  pondIds: string[]
  joined: string
  perms: Permissions
}

interface MNet {
  id: string
  shape: NetShape
  cm: number
  addedBy: string
  addedOn: string
  isFarmDefault: boolean
}

interface MScan {
  id: string
  pondId: string
  photo: string
  width: number
  height: number
  rimGuess: Pt[]
  /** The rim on the floor edge, for the mock's weight maths, and the ยอ shape it was drawn for. */
  truthRim: Pt[]
  truthShape: NetShape
  dots: Pt[] | null
  by: string
  at: string
  status: Scan['status']
  result: ScanResult | null
  measuredBy: string | null
  measuredById: string | null
  remeasures: number
  savedAt: string | null
  fixed: ScanSummary['fixed']
  quality: 'ok' | 'maybe_cut' | 'dark' | 'blurry'
  askedReason: AskAgainReason | null
}

interface MInvite {
  code: string
  role: Exclude<Role, 'owner'>
  pondIds: string[]
  createdOn: string
  status: 'open' | 'used' | 'cancelled'
}

interface MFarm {
  id: string
  name: string
  ownerId: string
  targetPerKg: number
  credits: number
  ponds: MPond[]
  members: MMember[]
  nets: MNet[]
  scans: MScan[]
  invites: MInvite[]
  notify: NotifySettings
  activity: { who: string; what: string; when: string }[]
  /** เรื่องน่าจับตา รับทราบ, farm-wide, by item key. */
  acks: Record<string, { signature: string; by: string; at: string }>
  /** สแกนวันนี้'s grid before the saved history starts: ponds scanned each past day. */
  pastDone: Record<string, number>
  /** The names the owner gave zones, by zone letters. */
  zoneNames: Record<string, string>
}

const DEFAULTS: Record<Role, Permissions> = {
  owner: { editOthers: true, measureInbox: true, farmOverview: true, printSheet: true, seePonds: true, remindMissing: true },
  manager: { editOthers: true, measureInbox: true, farmOverview: true, printSheet: true, seePonds: true, remindMissing: false },
  worker: { editOthers: false, measureInbox: false, farmOverview: false, printSheet: false, seePonds: true, remindMissing: true },
}

/** The farm-wide keys: other people's photos and results, the whole farm, the sheets. A worker never has them, whatever is stored. */
const SIZE_KEYS: PermissionKey[] = ['editOthers', 'measureInbox', 'farmOverview', 'printSheet']

function effective(m: MMember): Permissions {
  if (m.role !== 'worker') return m.perms
  const p = { ...m.perms }
  for (const k of SIZE_KEYS) p[k] = false
  return p
}

/** Pond numbers: an owner and a manager always, a worker (their own ponds only) while seePonds is on. */
function sees(m: MMember): boolean {
  return m.role !== 'worker' || effective(m).seePonds
}

/** Photos served at /mock-photos/:id: fixture names, or bytes uploaded in this run. */
export const photos = new Map<string, { bytes: Buffer; type: string }>()

/* ---------- seeding ---------- */

function issueOf(p: MPond): string | null {
  if (p.kind === 'm') return 'ยังไม่สแกนวันนี้'
  if (p.kind === 'w') return `ไซส์เริ่มไม่เสมอ (CV ${Math.round(p.cv * 100)}%)`
  if (p.kind === 'u') return p.gPerDay <= 0.2 ? `โตช้ามาก วันละ ${p.gPerDay.toFixed(2)} ก.` : 'แตกไซส์ 2 รุ่น และโตช้าลง'
  return null
}

/** Weights back in time on a power curve that ends at today's weight and slope. */
function curve(abw: number, gPerDay: number, age: number, day: number): number {
  const p = Math.min(3, Math.max(1, (gPerDay * age) / abw))
  return Math.max(0.3, abw * Math.pow(day / age, p))
}

function shrimpFor(seed: string, abw: number, cv: number, split: boolean, rim: Pt[], dots: Pt[] | null, shape: NetShape = 'round'): ScanResult['shrimp'] {
  const r = rng(seed)
  const n = dots?.length ?? 64
  let grams = Array.from({ length: n }, (_, i) => {
    const centre = split ? abw * (i % 2 ? 0.8 : 1.2) : abw
    return Math.max(abw * 0.4, centre * (1 + normal(r) * (split ? cv * 0.55 : cv)))
  })
  const mean = grams.reduce((a, b) => a + b, 0) / n
  grams = grams.map((g) => round1((g * abw) / mean)).sort((a, b) => a - b)
  let pts: Pt[]
  if (dots && dots.length >= n) {
    pts = dots.slice(0, n)
  } else {
    const fit = fitRim(shape, rim) ?? fitRim(shape, centredGuess(shape))!
    const b = rimBox(fit)
    const mid = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    pts = []
    while (pts.length < n) {
      // Away from the edge, where a shrimp is cut by the rim.
      const p = { x: mid.x + (r() - 0.5) * b.w * 0.86, y: mid.y + (r() - 0.5) * b.h * 0.86 }
      const inner = { x: mid.x + (p.x - mid.x) / 0.86, y: mid.y + (p.y - mid.y) / 0.86 }
      if (insideRim(fit, inner)) pts.push(p)
    }
  }
  return grams.map((g, i) => ({ x: Math.round(pts[i]!.x * 1000) / 1000, y: Math.round(pts[i]!.y * 1000) / 1000, g }))
}

function seedFarm(): MFarm {
  const ponds: MPond[] = []
  const members: MMember[] = []
  for (const [zone, , rows] of Z2) {
    rows.split(';').forEach((row, i) => {
      const [, abw, gpd, , kind] = row.split('|') as [string, string, string, string, string]
      const code = `${zone}${String(i + 1).padStart(2, '0')}`
      const trueAbw = Number(abw)
      const gPerDay = Number(gpd)
      const age = Math.max(35, Math.round(79 - (24.6 - trueAbw) / 0.3))
      const r = rng(code)
      const k = kind as MPond['kind']
      ponds.push({
        id: `p-${code.toLowerCase()}`,
        code,
        zone,
        trueAbw,
        gPerDay,
        kind: k,
        cv: k === 'w' ? 0.15 : k === 'u' && gPerDay > 0.2 ? 0.2 : 0.09 + r() * 0.02,
        split: k === 'u' && gPerDay > 0.2,
        stockedOn: addDays(TODAY, -age),
        count: STOCKED[code] ?? 180_000 + Math.round(r() * 8) * 10_000,
        survival: 0.8,
        netId: zone === 'E' ? 'net-75' : null,
        past: [],
        note: NOTES[code] ? { by: NOTES[code]!.by, at: at(TODAY, NOTES[code]!.hhmm), text: NOTES[code]!.text } : null,
      })
    })
  }
  for (const p of PEOPLE) {
    members.push({
      id: p.id,
      name: p.name,
      role: p.role,
      pondIds: ponds.filter((x) => p.zones.includes(x.zone)).map((x) => x.id),
      joined: p.joined,
      perms: { ...DEFAULTS[p.role] },
    })
  }
  const farm: MFarm = {
    id: 'farm-saina',
    name: 'ฟาร์มสายน้ำ',
    ownerId: 'm-wichai',
    targetPerKg: 40,
    credits: 47,
    ponds,
    members,
    nets: [
      { id: 'net-82', shape: 'round', cm: 82, addedBy: 'พี่วิชัย', addedOn: '2026-10-20', isFarmDefault: true },
      { id: 'net-75', shape: 'round', cm: 75, addedBy: 'บังดล', addedOn: '2026-10-19', isFarmDefault: false },
    ],
    scans: [],
    invites: [{ code: '7K2P9QX', role: 'worker', pondIds: ponds.filter((p) => p.zone === 'F').map((p) => p.id), createdOn: TODAY, status: 'open' }],
    notify: { photoIn: true, morningSummary: true, morningSheet: false, nearTarget: true, remindWorkers: true },
    activity: [...ACTIVITY],
    acks: {},
    pastDone: pastDone(ponds.length),
    // Two zones named, the rest not: the app shows both looks.
    zoneNames: { A: 'หน้าบ้าน', C: 'ริมคลอง' },
  }

  // History: saved scans 15, 10 and 5 days back, and today for every pond scanned this morning.
  for (const p of ponds) {
    const age = daysBetween(p.stockedOn!, TODAY)
    const by =
      members.find((m) => m.role === 'worker' && m.pondIds.includes(p.id)) ??
      members.find((m) => m.role === 'manager' && m.pondIds.includes(p.id)) ??
      members[0]!
    const doneToday = p.kind !== 'm' && p.code !== 'F10'
    const days = [-15, -10, -5, ...(doneToday ? [0] : [])]
    for (const back of [-35, -28, -21]) {
      if (age + back >= 7) p.past.push({ date: addDays(TODAY, back), abw: round1(curve(p.trueAbw, p.gPerDay, age, age + back)) })
    }
    days.forEach((back, i) => {
      const date = addDays(TODAY, back)
      let abw = round1(back === 0 ? p.trueAbw : curve(p.trueAbw, p.gPerDay, age, age + back))
      if (p.code === 'F10') abw = F10_HISTORY[i]?.[1] ?? abw
      const hhmm = back === 0 ? (p.code === 'A04' ? '07:28' : `06:${String(5 + (hash(p.code) % 50)).padStart(2, '0')}`) : '06:30'
      farm.scans.push(savedScan(farm, p, date, hhmm, abw, by))
    })
  }
  return farm
}

/** Saved history uses the full fixture: its rim and its 64 shrimp line up with the photo. */
function savedScan(farm: MFarm, p: MPond, date: string, hhmm: string, abw: number, measurer: MMember): MScan {
  const net = netFor(farm, p)
  const id = `s-${p.code.toLowerCase()}-${date.slice(5).replace('-', '')}`
  const shrimp = shrimpFor(id, abw, p.cv, p.split, FIXED, DOTS)
  const stats = weightStats(shrimp.map((s) => s.g))
  return {
    id,
    pondId: p.id,
    photo: 'yor',
    width: FIXTURE_SIZE.yor!.width,
    height: FIXTURE_SIZE.yor!.height,
    rimGuess: GUESS,
    truthRim: FIXED,
    truthShape: 'round',
    dots: DOTS,
    by: measurer.name,
    at: at(date, hhmm),
    status: 'saved',
    result: {
      abw,
      perKg: Math.round(1000 / abw),
      lengthCm: lengthOf(abw),
      count: shrimp.length,
      cv: round2(stats.cv),
      shrimp,
      rim: FIXED,
      net: { id: net.id, shape: net.shape, cm: net.cm },
      measuredAt: at(date, hhmm),
      remeasuresLeft: 3,
      previous: null,
    },
    measuredBy: measurer.name,
    measuredById: measurer.id,
    remeasures: 0,
    savedAt: at(date, hhmm),
    fixed: null,
    quality: 'ok',
    askedReason: null,
  }
}

function netFor(farm: MFarm, p: MPond): MNet {
  return farm.nets.find((n) => n.id === p.netId) ?? farm.nets.find((n) => n.isFarmDefault) ?? farm.nets[0] ?? { id: 'net-none', shape: 'round', cm: 82, addedBy: '', addedOn: TODAY, isFarmDefault: true }
}

function blankFarm(id: string, name: string, owner: { id: string; name: string }, ponds: { code: string; zone: string }[]): MFarm {
  const mp: MPond[] = ponds.map((x) => ({
    id: `${id}-${x.code.toLowerCase()}`,
    code: x.code,
    zone: x.zone,
    trueAbw: 9 + (hash(x.code) % 60) / 10,
    gPerDay: 0.3,
    kind: 'g',
    cv: 0.1,
    split: false,
    stockedOn: null,
    count: null,
    survival: null,
    netId: null,
    past: [],
    note: null,
  }))
  return {
    id,
    name,
    ownerId: owner.id,
    targetPerKg: 40,
    credits: 50,
    ponds: mp,
    members: [{ id: owner.id, name: owner.name, role: 'owner', pondIds: mp.map((p) => p.id), joined: TODAY, perms: { ...DEFAULTS.owner } }],
    nets: [],
    scans: [],
    invites: [],
    notify: { photoIn: true, morningSummary: true, morningSheet: false, nearTarget: true, remindWorkers: true },
    activity: [],
    acks: {},
    pastDone: {},
    zoneNames: {},
  }
}

/**
 * Thirteen weeks of mornings for the seeded farm: most days nearly every pond,
 * a slow start the first fortnight, and a few short days (rain, a sick
 * worker) so the grid has something to say.
 */
function pastDone(total: number): Record<string, number> {
  const r = rng('past-done')
  const out: Record<string, number> = {}
  for (let back = 90; back >= 1; back--) {
    const x = r()
    const share = back > 76 ? (x < 0.4 ? 0 : 0.2 + x * 0.4) : x < 0.05 ? 0.15 : x < 0.18 ? 0.6 + x : 0.9 + x * 0.1
    const n = Math.min(total, Math.round(total * share))
    if (n > 0) out[addDays(TODAY, -back)] = n
  }
  return out
}

/* ---------- the store ---------- */

interface Who {
  name: string
  memberId: string
  farmId: string | null
}

export class Store {
  farms = new Map<string, MFarm>()
  people: Record<Persona, Who> = {
    owner: { name: 'พี่วิชัย', memberId: 'm-wichai', farmId: 'farm-saina' },
    manager: { name: 'น้าศักดิ์', memberId: 'm-sak', farmId: 'farm-saina' },
    worker: { name: 'ช่างเอก', memberId: 'm-ek', farmId: 'farm-saina' },
    new: { name: 'พี่สมชาย', memberId: 'm-somchai', farmId: null },
    fresh: { name: 'พี่มานพ', memberId: 'm-manop', farmId: null },
  }
  seq = 0

  constructor() {
    const f = seedFarm()
    this.farms.set(f.id, f)
  }

  private nextId(prefix: string): string {
    this.seq += 1
    return `${prefix}-${Date.now().toString(36)}${this.seq}`
  }

  /* ----- who ----- */

  private ctx(persona: Persona): { who: Who; farm: MFarm; me: MMember } {
    const who = this.people[persona]
    const farm = who.farmId ? this.farms.get(who.farmId) : undefined
    if (!farm) throw new MockError(409, 'no_farm')
    const me = farm.members.find((m) => m.id === who.memberId)
    if (!me) throw new MockError(403, 'not_allowed')
    return { who, farm, me }
  }

  private need(me: MMember, key: PermissionKey): void {
    if (!effective(me)[key]) throw new MockError(403, 'not_allowed')
  }

  /** Writes to a pond (stocking, its ยอ) are not a worker's. */
  private noWorker(me: MMember): void {
    if (me.role === 'worker') throw new MockError(403, 'not_allowed')
  }

  /** The ponds `me` reads on the pond pages: every pond, a worker's own while seePonds is on (Bear, 2026-10-31). */
  private readable(farm: MFarm, me: MMember): MPond[] {
    if (!sees(me)) throw new MockError(403, 'not_allowed')
    return me.role === 'worker' ? farm.ponds.filter((p) => me.pondIds.includes(p.id)) : farm.ponds
  }

  /** One readable pond; the farm's pond someone else looks after is not_allowed. */
  private readPond(farm: MFarm, me: MMember, id: string): { p: MPond; list: MPond[] } {
    const list = this.readable(farm, me)
    const p = this.pond(farm, id)
    if (!list.includes(p)) throw new MockError(403, 'not_allowed')
    return { p, list }
  }

  private ownerOnly(me: MMember): void {
    if (me.role !== 'owner') throw new MockError(403, 'not_allowed')
  }

  private pond(farm: MFarm, id: string): MPond {
    const p = farm.ponds.find((x) => x.id === id)
    if (!p) throw new MockError(404, 'not_found')
    return p
  }

  private scan(farm: MFarm, id: string): MScan {
    const s = farm.scans.find((x) => x.id === id)
    if (!s) throw new MockError(404, 'not_found')
    return s
  }

  private farmRef(farm: MFarm): FarmRef {
    return {
      id: farm.id,
      name: farm.name,
      pondCount: farm.ponds.length,
      zoneCount: new Set(farm.ponds.map((p) => p.zone)).size,
      memberCount: farm.members.length,
      ownerName: farm.members.find((m) => m.id === farm.ownerId)?.name ?? '',
      targetPerKg: farm.targetPerKg,
    }
  }

  session(persona: Persona): Session {
    const who = this.people[persona]
    const farm = who.farmId ? this.farms.get(who.farmId) : undefined
    const me = farm?.members.find((m) => m.id === who.memberId)
    const candidate: FarmCandidate | null =
      !farm && persona === 'new'
        ? {
            id: CANDIDATE.id,
            name: CANDIDATE.name,
            pondCount: CANDIDATE.zones.length * CANDIDATE.perZone,
            zoneCount: CANDIDATE.zones.length,
            memberCount: CANDIDATE.members,
            source: `จากบัญชีน้องน้ำของ${who.name}`,
          }
        : null
    return {
      user: { name: me?.name ?? who.name },
      farm: farm && me ? this.farmRef(farm) : null,
      role: me?.role ?? null,
      permissions: me ? effective(me) : { ...DEFAULTS.worker },
      pondIds: me?.pondIds ?? [],
      creditsLeft: farm?.credits ?? 0,
      today: TODAY,
      candidate,
      env: 'mock',
    }
  }

  /** รหัสเข้าร่วม: the mock takes any code but WRONG, so the refusal can be seen. */
  gate(code: string): { ok: true } {
    if (!code.trim()) throw new MockError(400, 'bad_request')
    if (code.trim().toUpperCase() === 'WRONG') throw new MockError(404, 'invalid_code')
    return { ok: true }
  }

  start(persona: Persona, body: StartRequest): Session {
    const who = this.people[persona]
    if (who.farmId) return this.session(persona)
    let farm: MFarm
    if ('useFarmId' in body) {
      if (persona !== 'new' || body.useFarmId !== CANDIDATE.id) throw new MockError(404, 'not_found')
      const ponds = CANDIDATE.zones.flatMap((z) => Array.from({ length: CANDIDATE.perZone }, (_, i) => ({ code: `${z}${String(i + 1).padStart(2, '0')}`, zone: z })))
      farm = blankFarm(CANDIDATE.id, CANDIDATE.name, { id: who.memberId, name: who.name }, ponds)
    } else {
      const name = body.name.trim()
      if (!name || !body.ponds.length) throw new MockError(400, 'bad_request')
      if (body.code !== undefined && body.code.trim().toUpperCase() === 'WRONG') throw new MockError(403, 'code_required')
      const ponds = body.ponds.map((code) => ({ code, zone: zoneOfCode(code) }))
      farm = blankFarm(this.nextId('farm'), name, { id: who.memberId, name: who.name }, ponds)
      for (const [z, n] of Object.entries(body.zoneNames ?? {})) if (n.trim() && ponds.some((p) => p.zone === z)) farm.zoneNames[z] = n.trim()
    }
    this.farms.set(farm.id, farm)
    who.farmId = farm.id
    return this.session(persona)
  }

  setTarget(persona: Persona, targetPerKg: number): Session {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    if (![30, 35, 40, 45, 50].includes(targetPerKg)) throw new MockError(400, 'bad_request')
    farm.targetPerKg = targetPerKg
    return this.session(persona)
  }

  me(persona: Persona): { ok: boolean; env: string; user: string } {
    return { ok: true, env: 'mock', user: this.people[persona].name }
  }

  /* ----- ponds ----- */

  private saved(farm: MFarm, pondId: string): MScan[] {
    return farm.scans
      .filter((s) => s.pondId === pondId && s.status === 'saved' && s.result)
      .sort((a, b) => (a.savedAt! < b.savedAt! ? 1 : -1))
  }

  private caretaker(farm: MFarm, p: MPond): string | null {
    const w = farm.members.find((m) => m.role === 'worker' && m.pondIds.includes(p.id))
    const m = farm.members.find((x) => x.role === 'manager' && x.pondIds.includes(p.id))
    return (w ?? m)?.name ?? null
  }

  /** Today's saved scan of a pond, by anyone. */
  private savedToday(farm: MFarm, pondId: string): MScan | undefined {
    return this.saved(farm, pondId).find((s) => dayOf(s.savedAt!) === TODAY)
  }

  private photoToday(farm: MFarm, p: MPond): boolean {
    return Boolean(this.savedToday(farm, p.id))
  }

  tile(farm: MFarm, p: MPond, me?: MMember): PondTile {
    const last = this.saved(farm, p.id)[0]
    const abw = last?.result?.abw ?? null
    const targetG = 1000 / farm.targetPerKg
    const photoToday = this.photoToday(farm, p)
    const daysToTarget = abw !== null ? Math.max(0, Math.ceil(round2((targetG - abw) / p.gPerDay))) : null
    const reachOn = daysToTarget !== null ? addDays(TODAY, daysToTarget) : null
    let status: PondStatus
    if (!photoToday) status = 'missing'
    else if (p.kind === 'u') status = 'urgent'
    else if (p.kind === 'w') status = 'watch'
    else if (daysToTarget !== null && daysToTarget <= 5) status = 'ready'
    else status = 'good'
    return {
      id: p.id,
      code: p.code,
      zone: p.zone,
      caretaker: this.caretaker(farm, p),
      perKg: abw !== null ? Math.round(1000 / abw) : null,
      abw,
      gPerDay: abw !== null ? p.gPerDay : null,
      reachOn,
      daysToTarget,
      status,
      photoToday,
      mine: me ? me.pondIds.includes(p.id) : false,
      issue: status === 'missing' ? 'ยังไม่สแกนวันนี้' : status === 'urgent' || status === 'watch' ? issueOf(p) : null,
      ageDays: p.stockedOn ? daysBetween(p.stockedOn, TODAY) : null,
      netId: farm.nets.length ? netFor(farm, p).id : null,
    }
  }

  ponds(persona: Persona): PondsResponse {
    const { farm, me } = this.ctx(persona)
    const list = this.readable(farm, me)
    const tiles = list.map((p) => this.tile(farm, p, me))
    const zones = [...new Set(list.map((p) => p.zone))].map((zone) => {
      const zt = tiles.filter((t) => t.zone === zone)
      return { zone, name: farm.zoneNames[zone] ?? null, caretaker: zt[0]?.caretaker ?? null, total: zt.length, photoToday: zt.filter((t) => t.photoToday).length }
    })
    return { zones, ponds: tiles }
  }

  /* ---------- แก้ไขโซนและบ่อ (owner) ---------- */

  setZoneName(persona: Persona, zone: string, name: string): void {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const z = zone.toUpperCase()
    if (!farm.ponds.some((p) => p.zone === z)) throw new MockError(404, 'not_found')
    const n = name.replace(/\s+/g, ' ').trim()
    if (n.length > 30) throw new MockError(400, 'bad_request')
    if (n) farm.zoneNames[z] = n
    else delete farm.zoneNames[z]
  }

  addPonds(persona: Persona, codes: string[]): { ponds: { id: string; code: string }[] } {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const clean = codes.map((c) => c.trim())
    if (!clean.length || clean.length > 60 || clean.some((c) => !c || c.length > 20)) throw new MockError(400, 'bad_request')
    if (new Set(clean.map((c) => c.toLowerCase())).size !== clean.length) throw new MockError(400, 'bad_request')
    if (farm.ponds.length + clean.length > 300) throw new MockError(409, 'too_many_ponds')
    const taken = new Set(farm.ponds.map((p) => p.code.toLowerCase()))
    if (clean.some((c) => taken.has(c.toLowerCase()))) throw new MockError(409, 'name_taken')
    const made = blankFarm(farm.id, farm.name, { id: farm.ownerId, name: '' }, clean.map((code) => ({ code, zone: zoneOfCode(code) }))).ponds.map((p) => ({ ...p, id: this.nextId('pond') }))
    farm.ponds.push(...made)
    farm.ponds.sort((a, b) => a.code.localeCompare(b.code))
    // The owner looks after every pond.
    const owner = farm.members.find((m) => m.id === farm.ownerId)
    if (owner) owner.pondIds.push(...made.map((p) => p.id))
    return { ponds: made.map((p) => ({ id: p.id, code: p.code })) }
  }

  renamePond(persona: Persona, id: string, code: string): void {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const p = this.pond(farm, id)
    const c = code.trim()
    if (!c || c.length > 20 || zoneOfCode(c) !== p.zone) throw new MockError(400, 'bad_request')
    if (farm.ponds.some((x) => x.id !== p.id && x.code.toLowerCase() === c.toLowerCase())) throw new MockError(409, 'name_taken')
    p.code = c
    farm.ponds.sort((a, b) => a.code.localeCompare(b.code))
  }

  private summary(farm: MFarm, s: MScan, me: MMember): ScanSummary {
    const r = s.result!
    return {
      scanId: s.id,
      date: dayOf(s.at),
      at: s.at,
      abw: r.abw,
      perKg: r.perKg,
      cv: r.cv,
      photoUrl: photoUrl(s.photo),
      photoBy: s.by,
      measuredBy: s.measuredBy ?? s.by,
      fixed: s.fixed,
      lighter: isLighter(r.abw, r.previous ?? this.previousOf(farm, s)),
      canFix: this.canFix(s, me),
    }
  }

  private canFix(s: MScan, me: MMember): boolean {
    return sees(me) && Boolean(s.result) && (s.measuredById === me.id || effective(me).editOthers)
  }

  private previousOf(farm: MFarm, s: MScan): { abw: number; date: string } | null {
    const before = farm.scans
      .filter((x) => x.pondId === s.pondId && x.id !== s.id && x.status === 'saved' && x.result && x.at < s.at)
      .sort((a, b) => (a.at < b.at ? 1 : -1))[0]
    return before?.result ? { abw: before.result.abw, date: dayOf(before.at) } : null
  }

  private growth(farm: MFarm, p: MPond): GrowthPoint[] {
    const start = p.stockedOn
    // The spread: the pond's CV on the older weights (a little uneven, like real scans), each saved scan's own CV after.
    const pts = [
      ...p.past.map((x, i) => ({ ...x, sd: round1(x.abw * p.cv * (1 + 0.15 * Math.sin(i * 1.9))) })),
      ...this.saved(farm, p.id)
        .reverse()
        .map((s) => ({ date: dayOf(s.at), abw: s.result!.abw, sd: round1(s.result!.abw * s.result!.cv) })),
    ]
    return pts.map((x) => ({ date: x.date, abw: x.abw, sd: x.sd, day: start ? daysBetween(start, x.date) : 0 }))
  }

  pondDetail(persona: Persona, id: string): PondDetail {
    const { farm, me } = this.ctx(persona)
    const { p, list } = this.readPond(farm, me, id)
    const tile = this.tile(farm, p, me)
    const last = this.saved(farm, p.id)[0]
    const idx = list.indexOf(p)
    const prev = list[idx - 1] ?? null
    const next = list[idx + 1] ?? null
    // A worker sees the pond's age (from the stocking day), not how many went in or the tonnes.
    const worker = me.role === 'worker'
    const growth = this.growth(farm, p)
    const chance: Record<PondStatus, number> = { ready: 0.92, good: 0.8, watch: 0.6, urgent: 0.35, missing: 0.7 }
    return {
      pond: tile,
      growth,
      latest: last ? this.summary(farm, last, me) : null,
      latestShrimpGrams: last?.result?.shrimp.map((s) => s.g) ?? [],
      stocking: { stockedOn: p.stockedOn, count: worker ? null : p.count, survival: worker ? null : p.survival },
      tonnesNow: !worker && tile.abw !== null && p.count ? round1((p.count * (p.survival ?? 0.8) * tile.abw) / 1e6) : null,
      note: p.note,
      prevId: prev?.id ?? null,
      prevCode: prev?.code ?? null,
      nextId: next?.id ?? null,
      nextCode: next?.code ?? null,
      onTimeChance: growth.length >= 2 ? chance[tile.status] : null,
    }
  }

  pondScans(persona: Persona, id: string): PondScansResponse {
    const { farm, me } = this.ctx(persona)
    const { p } = this.readPond(farm, me, id)
    return { pond: this.tile(farm, p, me), scans: this.saved(farm, p.id).map((s) => this.summary(farm, s, me)) }
  }

  stocking(persona: Persona, id: string): Stocking {
    const { farm, me } = this.ctx(persona)
    this.noWorker(me)
    const p = this.pond(farm, id)
    return { stockedOn: p.stockedOn, count: p.count, survival: p.survival }
  }

  saveStocking(persona: Persona, id: string, body: Stocking): Stocking {
    const { farm, me } = this.ctx(persona)
    if (me.role === 'worker') throw new MockError(403, 'not_allowed')
    const p = this.pond(farm, id)
    p.stockedOn = body.stockedOn
    p.count = body.count
    p.survival = body.survival
    return this.stocking(persona, id)
  }

  setPondNet(persona: Persona, id: string, netId: string): void {
    const { farm, me } = this.ctx(persona)
    if (me.role === 'worker') throw new MockError(403, 'not_allowed')
    const p = this.pond(farm, id)
    if (!farm.nets.some((n) => n.id === netId)) throw new MockError(404, 'not_found')
    p.netId = netId
  }

  /* ----- overview ----- */

  overview(persona: Persona): Overview {
    const { farm, me } = this.ctx(persona)
    this.need(me, 'farmOverview')
    const tiles = farm.ponds.map((p) => this.tile(farm, p, me))
    const targetG = 1000 / farm.targetPerKg
    const tonnes = (t: PondTile) => {
      const p = farm.ponds.find((x) => x.id === t.id)!
      return p.count ? round1((p.count * (p.survival ?? 0.8) * targetG) / 1e6) : 0
    }
    const row = (t: PondTile): QueueRow => ({ pondId: t.id, pondCode: t.code, date: t.reachOn!, perKg: t.perKg!, abw: t.abw!, tonnes: tonnes(t) })
    const known = tiles.filter((t) => t.daysToTarget !== null && t.reachOn).sort((a, b) => a.daysToTarget! - b.daysToTarget! || a.code.localeCompare(b.code))
    const soon = known.filter((t) => t.daysToTarget! <= 5).map(row)
    const later = known.filter((t) => t.daysToTarget! > 5 && t.daysToTarget! <= 14).map(row)
    const band = (from: number, to: number | null) => {
      const xs = known.filter((t) => t.daysToTarget! >= from && (to === null || t.daysToTarget! <= to))
      return { from, to, ponds: xs.length, tonnes: round1(xs.reduce((a, t) => a + tonnes(t), 0)) }
    }
    const sum = (rows: QueueRow[]) => round1(rows.reduce((a, r) => a + r.tonnes, 0))
    const ready = tiles.filter((t) => t.status === 'ready')
    const urgent = tiles.filter((t) => t.status === 'urgent')
    const missing = tiles.filter((t) => t.status === 'missing')
    const watch = this.watch(farm, tiles, soon)
    return {
      farmName: farm.name,
      today: TODAY,
      pondCount: farm.ponds.length,
      targetPerKg: farm.targetPerKg,
      watch,
      tiles: {
        ready: { n: ready.length, tonnes: round1(ready.reduce((a, t) => a + tonnes(t), 0)) },
        good: { n: tiles.filter((t) => t.status === 'good').length },
        watch: { n: tiles.filter((t) => t.status === 'watch').length },
        urgent: { n: urgent.length + missing.length, slow: urgent.length, missing: missing.length },
      },
      photosToday: {
        sent: tiles.filter((t) => t.photoToday).length,
        total: tiles.length,
        missing: missing.map((t) => t.code),
        zones: [...new Set(tiles.map((t) => t.zone))].map((zone) => {
          const zt = tiles.filter((t) => t.zone === zone)
          return { zone, name: farm.zoneNames[zone] ?? null, done: zt.filter((t) => t.photoToday).length, total: zt.length }
        }),
        remindAt: farm.notify.remindWorkers ? '10:00' : null,
      },
      queueDays: Array.from({ length: 14 }, (_, i) => {
        const date = addDays(TODAY, i)
        return { date, n: known.filter((t) => t.reachOn === date).length }
      }),
      soon: { rows: soon, tonnes: sum(soon) },
      later: { rows: later, tonnes: sum(later) },
      beyond: [band(15, 25), band(26, null)].filter((b) => b.ponds > 0),
    }
  }

  /**
   * เรื่องน่าจับตา: ponds to harvest in the next 3 days (one row each), the
   * ponds not scanned yet today, then the slow or uneven ones. Today's rows
   * come first.
   */
  private watch(farm: MFarm, tiles: PondTile[], soon: QueueRow[]): WatchItem[] {
    const items: Omit<WatchItem, 'acked'>[] = []
    /** Lower shows first: today's rows, then the coming days, then the slow ponds. */
    const rank = new Map<string, number>()
    for (const r of soon) {
      const t = tiles.find((x) => x.id === r.pondId)!
      const days = t.daysToTarget!
      if (days > 3) continue
      const when = days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : fmtDay(r.date)
      rank.set(`harvest-${t.code}`, days === 0 ? 0 : 2 + days)
      items.push({
        key: `harvest-${t.code}`,
        kind: 'harvest',
        title: `โทรนัดห้องเย็น จับบ่อ ${t.code}`,
        chip: days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`,
        tone: days === 0 ? 'soon' : 'plain',
        detail: `ถึงไซส์ **${r.perKg} ตัว/กก.** ${when} · ราว **${r.tonnes} ตัน**${t.caretaker ? ` · ${t.caretaker} ดูแลโซน ${t.zone}` : ''}`,
        auto: null,
        action: { label: `เปิดบ่อ ${t.code}`, to: 'pond', pondId: t.id },
        ackable: true,
        signature: `${r.date}:${r.perKg}`,
      })
    }
    const missing = tiles.filter((t) => t.status === 'missing')
    if (missing.length) {
      const names = [...new Set(missing.map((t) => t.caretaker).filter((x): x is string => !!x))]
      const who = names.length > 1 ? `${names.slice(0, -1).join(' ')} กับ${names[names.length - 1]}` : (names[0] ?? '')
      const codes = missing.map((t) => t.code).join(' · ')
      rank.set('missing', 1)
      items.push({
        key: 'missing',
        kind: 'missing',
        title: missing.length === 1 ? `บ่อ ${missing[0]!.code} ยังไม่ได้สแกนวันนี้` : `${missing.length} บ่อยังไม่ได้สแกนวันนี้`,
        chip: 'วันนี้',
        tone: 'soon',
        detail: `**${codes}**${who ? ` · ${who} ดูแลอยู่` : ''}`,
        auto: 'หายไปเองเมื่อสแกนแล้วค่ะ',
        action: { label: 'ดูว่าใครสแกนแล้ว', to: 'team' },
        ackable: false,
        signature: codes,
      })
    }
    const slow = tiles.filter((t) => t.status === 'urgent')
    if (slow.length) {
      const codes = slow.map((t) => t.code).join(' · ')
      rank.set('slow', 9)
      items.push({
        key: 'slow',
        kind: 'slow',
        title: `${slow.length} บ่อโตช้าหรือแตกไซส์`,
        chip: 'ตรวจดู',
        tone: 'alert',
        detail: `**${codes}** โตช้ากว่าที่ควร หรือไซส์ในบ่อไม่เสมอ`,
        auto: null,
        action: { label: 'ดูบ่อที่ต้องดู', to: 'urgent' },
        ackable: true,
        signature: codes,
      })
    }
    return items
      .sort((a, b) => rank.get(a.key)! - rank.get(b.key)!)
      .map((i) => {
        const a = i.ackable ? farm.acks[i.key] : undefined
        return { ...i, acked: a && a.signature === i.signature ? { by: a.by, at: a.at } : null }
      })
  }

  ackWatch(persona: Persona, key: string, signature: string): WatchAck {
    const { farm, me } = this.ctx(persona)
    this.need(me, 'farmOverview')
    if (!signature) throw new MockError(400, 'signature_required')
    if (!this.overview(persona).watch.some((w) => w.key === key && w.ackable)) throw new MockError(404, 'not_found')
    const a = { signature, by: me.name, at: fmtTime(nowIso()) }
    farm.acks[key] = a
    return { by: a.by, at: a.at }
  }

  unackWatch(persona: Persona, key: string): void {
    const { farm, me } = this.ctx(persona)
    this.need(me, 'farmOverview')
    delete farm.acks[key]
  }

  today(persona: Persona): TodayResponse {
    const { farm, me } = this.ctx(persona)
    const rows = farm.ponds
      .filter((p) => me.pondIds.includes(p.id))
      .map((p) => {
        const s = this.savedToday(farm, p.id)
        return {
          pondId: p.id,
          pondCode: p.code,
          netId: farm.nets.length ? netFor(farm, p).id : null,
          scanId: s?.id ?? null,
          by: s ? (s.measuredBy ?? s.by) : null,
          at: s?.savedAt ?? null,
          photoUrl: s ? photoUrl(s.photo) : null,
        }
      })
    return { done: rows.filter((r) => r.scanId).length, total: rows.length, rows }
  }

  /* ----- nets ----- */

  private netView(farm: MFarm, n: MNet): Net {
    const own = farm.ponds.filter((p) => p.netId === n.id)
    const uses = n.isFarmDefault ? farm.ponds.filter((p) => !p.netId || p.netId === n.id) : own
    return {
      id: n.id,
      shape: n.shape,
      cm: n.cm,
      use: n.isFarmDefault ? 'ยอของฟาร์ม' : own.length ? pondRange(own.map((p) => p.code).sort()) : 'ยังไม่ผูกบ่อ',
      pondCount: uses.length,
      addedBy: `${n.addedBy}ใส่ ${fmtDay(n.addedOn)}`,
      addedOn: n.addedOn,
      isFarmDefault: n.isFarmDefault,
    }
  }

  nets(persona: Persona): { nets: Net[] } {
    const { farm } = this.ctx(persona)
    return { nets: farm.nets.map((n) => this.netView(farm, n)) }
  }

  addNet(persona: Persona, body: NetCreate): Net {
    const { farm, me } = this.ctx(persona)
    if (!Number.isInteger(body.cm) || body.cm < NET_CM_MIN || body.cm > NET_CM_MAX) throw new MockError(400, 'net_out_of_range')
    const first = farm.nets.length === 0
    const n: MNet = { id: this.nextId('net'), shape: body.shape, cm: body.cm, addedBy: me.name, addedOn: TODAY, isFarmDefault: first || Boolean(body.farmDefault) }
    if (n.isFarmDefault) farm.nets.forEach((x) => (x.isFarmDefault = false))
    farm.nets.push(n)
    if (body.pondId) this.pond(farm, body.pondId).netId = n.id
    return this.netView(farm, n)
  }

  editNet(persona: Persona, id: string, body: NetEdit): Net {
    const { farm } = this.ctx(persona)
    const n = farm.nets.find((x) => x.id === id)
    if (!n) throw new MockError(404, 'not_found')
    if (!Number.isInteger(body.cm) || body.cm < NET_CM_MIN || body.cm > NET_CM_MAX) throw new MockError(400, 'net_out_of_range')
    n.cm = body.cm
    if (body.shape) n.shape = body.shape
    return this.netView(farm, n)
  }

  /* ----- scans ----- */

  private scanView(farm: MFarm, s: MScan, me: MMember): Scan {
    const p = this.pond(farm, s.pondId)
    return {
      id: s.id,
      pondId: p.id,
      pondCode: p.code,
      photoUrl: photoUrl(s.photo),
      width: s.width,
      height: s.height,
      rimGuess: s.rimGuess,
      net: farm.nets.length ? this.netView(farm, netFor(farm, p)) : null,
      photoBy: s.by,
      photoAt: s.at,
      status: s.status,
      result: sees(me) ? s.result : null,
      found: s.result ? s.result.shrimp.map((q) => ({ x: q.x, y: q.y })) : null,
      measuredBy: s.measuredBy,
      canFix: this.canFix(s, me),
    }
  }

  upload(persona: Persona, pondId: string, bytes: Buffer, type: string): { scan: Scan } {
    const { farm, me } = this.ctx(persona)
    const p = this.pond(farm, pondId)
    // A worker scans the ponds they look after; the owner moves a pond to them first.
    if (me.role === 'worker' && !me.pondIds.includes(p.id)) throw new MockError(403, 'not_allowed')
    const size = imageSize(bytes) ?? { width: 1600, height: 1200 }
    // The yor fixture (or a crop of it at its aspect): the guess, the true rim and the dots line up.
    // Into a pond whose ยอ is square, a fixture-sized photo is yor-square.jpg.
    const fixture = size.width >= 400 && Math.abs(size.width / size.height - FIXTURE_ASPECT) < 0.01
    const shape: NetShape = farm.nets.length ? netFor(farm, p).shape : 'round'
    const sq = shape === 'square'
    const id = this.nextId('s')
    const photo = `up-${id}`
    photos.set(photo, { bytes, type: type || 'image/jpeg' })
    const s: MScan = {
      id,
      pondId: p.id,
      photo,
      width: size.width,
      height: size.height,
      rimGuess: fixture ? (sq ? SQ_GUESS : GUESS) : centredGuess(shape),
      truthRim: fixture ? (sq ? SQ_FIXED : FIXED) : centredGuess(shape),
      truthShape: shape,
      dots: fixture ? (sq ? SQ_DOTS : DOTS) : null,
      by: me.name,
      at: nowIso(),
      status: 'waiting',
      result: null,
      measuredBy: null,
      measuredById: null,
      remeasures: 0,
      savedAt: null,
      fixed: null,
      quality: 'ok',
      askedReason: null,
    }
    farm.scans.push(s)
    return { scan: this.scanView(farm, s, me) }
  }

  getScan(persona: Persona, id: string): Scan {
    const { farm, me } = this.ctx(persona)
    return this.scanView(farm, this.scan(farm, id), me)
  }

  /** What น้ำ would measure on this photo with this rim and this ยอ. */
  private compute(farm: MFarm, s: MScan, rim: Pt[], net: MNet): ScanResult {
    const p = this.pond(farm, s.pondId)
    if (!fitRim(net.shape, rim)) throw new MockError(400, 'bad_rim')
    const trueNet = p.zone === 'E' && farm.id === 'farm-saina' ? 75 : 82
    const rimK = Math.pow(rimAreaOf(s.truthShape, s.truthRim) / rimAreaOf(net.shape, rim), RIM_EXP)
    const netK = Math.pow(net.cm / trueNet, 3)
    const abw = round1(p.trueAbw * rimK * netK)
    const shrimp = shrimpFor(`${s.id}:${abw}`, abw, p.cv, p.split, rim, s.dots, net.shape)
    const stats = weightStats(shrimp.map((q) => q.g))
    return {
      abw,
      perKg: Math.round(1000 / abw),
      lengthCm: lengthOf(abw),
      count: shrimp.length,
      cv: round2(stats.cv),
      shrimp,
      rim,
      net: { id: net.id, shape: net.shape, cm: net.cm },
      measuredAt: s.result?.measuredAt ?? nowIso(),
      remeasuresLeft: Math.max(0, 3 - s.remeasures),
      previous: this.previousOf(farm, s),
    }
  }

  measure(persona: Persona, id: string, rim: Pt[], netId: string): MeasureResponse {
    const { farm, me } = this.ctx(persona)
    const s = this.scan(farm, id)
    if (s.by !== me.name) this.need(me, 'measureInbox')
    if (!farm.nets.length) throw new MockError(409, 'no_net')
    const net = farm.nets.find((n) => n.id === netId) ?? netFor(farm, this.pond(farm, s.pondId))
    if (s.result) {
      if (s.remeasures >= 3) throw new MockError(409, 'remeasure_limit')
      s.remeasures += 1
    } else {
      if (farm.credits <= 0) throw new MockError(402, 'no_credits')
      farm.credits -= 1
    }
    s.result = this.compute(farm, s, rim, net)
    s.status = 'measured'
    s.measuredBy = me.name
    s.measuredById = me.id
    return { scan: this.scanView(farm, s, me), creditsLeft: farm.credits }
  }

  changeNet(persona: Persona, id: string, netId: string): MeasureResponse {
    const { farm, me } = this.ctx(persona)
    const s = this.scan(farm, id)
    if (!s.result) throw new MockError(409, 'not_measured')
    const net = farm.nets.find((n) => n.id === netId)
    if (!net) throw new MockError(404, 'not_found')
    // The chosen ยอ becomes this pond's from now on; measuring the same photo again is free.
    const p = this.pond(farm, s.pondId)
    p.netId = net.isFarmDefault ? null : net.id
    s.result = this.compute(farm, s, s.result.rim, net)
    return { scan: this.scanView(farm, s, me), creditsLeft: farm.credits }
  }

  save(persona: Persona, id: string, notes: string[] = []): SaveResponse {
    const { farm, me } = this.ctx(persona)
    const s = this.scan(farm, id)
    if (!s.result) throw new MockError(409, 'not_measured')
    const p = this.pond(farm, s.pondId)
    s.status = 'saved'
    s.savedAt = nowIso()
    if (notes.length) p.note = { by: me.name, at: nowIso(), text: notes.join(' · ') }
    farm.activity.unshift({ who: me.name, what: `สแกนกุ้ง · ${p.code}`, when: `วันนี้ ${fmtTime(nowIso())}` })
    const mine = me.pondIds
    const doneToday = this.today(persona).done
    const tile = this.tile(farm, p, me)
    return {
      pondId: p.id,
      pondCode: p.code,
      doneToday,
      mineTotal: mine.length,
      reachOn: sees(me) ? tile.reachOn : null,
    }
  }

  fix(persona: Persona, id: string, rim: Pt[]): FixResponse {
    const { farm, me } = this.ctx(persona)
    const s = this.scan(farm, id)
    if (!s.result || !this.canFix(s, me)) throw new MockError(403, 'not_allowed')
    if (s.remeasures >= 3) throw new MockError(409, 'remeasure_limit')
    s.remeasures += 1
    const net = farm.nets.find((n) => n.id === s.result!.net.id) ?? netFor(farm, this.pond(farm, s.pondId))
    const after = this.compute(farm, s, rim, net)
    return { before: s.result, after }
  }

  fixApply(persona: Persona, id: string, use: 'new' | 'old', rim: Pt[]): void {
    const { farm, me } = this.ctx(persona)
    const s = this.scan(farm, id)
    if (!s.result || !this.canFix(s, me)) throw new MockError(403, 'not_allowed')
    if (use === 'old') return
    const net = farm.nets.find((n) => n.id === s.result!.net.id) ?? netFor(farm, this.pond(farm, s.pondId))
    const old = s.result
    s.result = { ...this.compute(farm, s, rim, net), measuredAt: old.measuredAt }
    s.fixed = { by: me.name, at: nowIso(), oldPerKg: old.perKg }
  }

  /* ----- inbox ----- */

  inbox(persona: Persona): InboxResponse {
    const { farm, me } = this.ctx(persona)
    this.need(me, 'measureInbox')
    const waiting = farm.scans.filter((s) => s.status === 'waiting' && s.by !== me.name && !s.result)
    const senders = farm.members.filter((m) => m.role !== 'owner').map((m) => ({ name: m.name, n: waiting.filter((s) => s.by === m.name).length }))
    return {
      photos: waiting.map((s) => ({
        scanId: s.id,
        pondId: s.pondId,
        pondCode: this.pond(farm, s.pondId).code,
        photoUrl: photoUrl(s.photo),
        by: s.by,
        at: s.at,
        quality: s.quality,
      })),
      creditsLeft: farm.credits,
      senders: senders.filter((x) => x.n > 0),
    }
  }

  askAgain(persona: Persona, id: string, reason: AskAgainReason): void {
    const { farm, me } = this.ctx(persona)
    if (me.role === 'worker') throw new MockError(403, 'not_allowed')
    const s = this.scan(farm, id)
    if (s.status === 'waiting') s.status = 'asked_again'
    s.askedReason = reason
  }

  /* ----- people ----- */

  private memberView(farm: MFarm, m: MMember, me: MMember): Member {
    const codes = farm.ponds.filter((p) => m.pondIds.includes(p.id))
    const done = codes.filter((p) => this.photoToday(farm, p)).length
    const zones = [...new Set(codes.map((p) => p.zone))]
    return {
      id: m.id,
      name: m.name,
      pictureUrl: pictureOf(m.id),
      role: m.role,
      scope:
        m.role === 'owner'
          ? 'ทุกบ่อ'
          : m.role === 'manager'
            ? `ดูแล ${codes.length} บ่อ · โซน ${zones.join(' และ ')}`
            : `ดูแล ${codes.length} บ่อ · วันนี้ ${done}/${codes.length}`,
      joined: m.role === 'owner' ? 'เจ้าของฟาร์ม' : `เข้าร่วม ${fmtDayYear(m.joined)}`,
      isYou: m.id === me.id,
    }
  }

  private pondsLabel(farm: MFarm, ids: string[]): string {
    const codes = farm.ponds.filter((p) => ids.includes(p.id)).map((p) => p.code)
    if (!codes.length) return 'ทุกบ่อ'
    const zones = new Set(codes.map((c) => c.replace(/\d+$/, '')))
    if (zones.size === 1) return pondRange(codes)
    return codes.length <= 4 ? codes.join(' ') : `${codes.slice(0, 3).join(' ')} และอีก ${codes.length - 3} บ่อ`
  }

  private inviteView(farm: MFarm, inv: MInvite, host: string): Invite {
    const expiresOn = addDays(inv.createdOn, 7)
    return {
      code: inv.code,
      url: `${host}/liff/app/join?invite=${inv.code}`,
      role: inv.role,
      pondsLabel: this.pondsLabel(farm, inv.pondIds),
      expiresOn,
      daysLeft: Math.max(0, daysBetween(TODAY, expiresOn)),
    }
  }

  members(persona: Persona, host: string): MembersResponse {
    const { farm, me } = this.ctx(persona)
    const covered = new Set(farm.members.filter((m) => m.role !== 'owner').flatMap((m) => farm.ponds.filter((p) => m.pondIds.includes(p.id)).map((p) => p.zone)))
    return {
      members: farm.members.map((m) => this.memberView(farm, m, me)),
      invites: me.role === 'owner' ? farm.invites.filter((i) => i.status === 'open').map((i) => this.inviteView(farm, i, host)) : [],
      activity: farm.activity.slice(0, 6),
      uncoveredZones: [...new Set(farm.ponds.map((p) => p.zone))].filter((z) => !covered.has(z)),
    }
  }

  /** Who scanned today (O39): everyone who looks after ponds, against their ponds. */
  teamToday(persona: Persona): TeamTodayResponse {
    const { farm, me } = this.ctx(persona)
    this.need(me, 'farmOverview')
    const row = (p: MPond): TeamPond => {
      const s = this.savedToday(farm, p.id)
      return { pondId: p.id, pondCode: p.code, at: s?.savedAt ?? null, by: s ? (s.measuredBy ?? s.by) : null }
    }
    const people = farm.members
      .filter((m): m is MMember & { role: 'manager' | 'worker' } => m.role !== 'owner' && m.pondIds.length > 0)
      .map((m) => {
        const ponds = farm.ponds.filter((p) => m.pondIds.includes(p.id)).map(row)
        const times = ponds.map((x) => x.at).filter((x): x is string => x !== null).sort()
        return {
          memberId: m.id,
          name: m.name,
          pictureUrl: pictureOf(m.id),
          role: m.role,
          pondsLabel: this.pondsLabel(farm, m.pondIds),
          done: times.length,
          total: ponds.length,
          lastAt: times[times.length - 1] ?? null,
          ponds,
        }
      })
    // People with ponds left first, in the farm's order; the finished after them.
    people.sort((a, b) => Number(a.done === a.total) - Number(b.done === b.total))
    const held = new Set(people.flatMap((x) => x.ponds.map((p) => p.pondId)))
    const all = farm.ponds.map(row)
    return {
      today: TODAY,
      done: all.filter((x) => x.at).length,
      total: all.length,
      people,
      nobody: all.filter((x) => !held.has(x.pondId)),
      remindAt: farm.notify.remindWorkers ? '10:00' : null,
      history: this.history(farm),
    }
  }

  /** Ponds scanned each day of the last 13 weeks: the saved scans, over the seeded mornings before them. */
  private history(farm: MFarm): TeamDay[] {
    const since = addDays(TODAY, -(13 * 7 - 1))
    const byDay = new Map<string, Set<string>>()
    for (const s of farm.scans) {
      if (!s.savedAt) continue
      const d = dayOf(s.savedAt)
      if (d < since) continue
      const set = byDay.get(d) ?? new Set<string>()
      set.add(s.pondId)
      byDay.set(d, set)
    }
    const days = new Map<string, number>(Object.entries(farm.pastDone).filter(([d]) => d >= since))
    for (const [d, set] of byDay) days.set(d, Math.max(days.get(d) ?? 0, set.size))
    return [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, done]) => ({ date, done }))
  }

  private pondsView(farm: MFarm, m: MMember, me: MMember): MemberPondsResponse {
    return {
      member: this.memberView(farm, m, me),
      pondIds: farm.ponds.filter((p) => m.pondIds.includes(p.id)).map((p) => p.id),
      ponds: farm.ponds.map((p) => ({
        id: p.id,
        code: p.code,
        zone: p.zone,
        heldBy: farm.members.find((x) => x.id !== m.id && x.role !== 'owner' && x.pondIds.includes(p.id))?.name ?? null,
      })),
    }
  }

  memberPonds(persona: Persona, id: string): MemberPondsResponse {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const m = this.member(farm, id)
    if (m.role === 'owner') throw new MockError(403, 'not_allowed')
    return this.pondsView(farm, m, me)
  }

  /** One caretaker a pond: a pond given to this person leaves whoever had it. */
  setMemberPonds(persona: Persona, id: string, pondIds: string[]): MemberPondsResponse {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const m = this.member(farm, id)
    if (m.role === 'owner') throw new MockError(403, 'not_allowed')
    const ids = farm.ponds.filter((p) => pondIds.includes(p.id)).map((p) => p.id)
    for (const x of farm.members) if (x.id !== m.id && x.role !== 'owner') x.pondIds = x.pondIds.filter((p) => !ids.includes(p))
    m.pondIds = ids
    return this.pondsView(farm, m, me)
  }

  private member(farm: MFarm, id: string): MMember {
    const m = farm.members.find((x) => x.id === id)
    if (!m) throw new MockError(404, 'not_found')
    return m
  }

  setRole(persona: Persona, id: string, role: Exclude<Role, 'owner'>): void {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const m = this.member(farm, id)
    if (m.role === 'owner') throw new MockError(403, 'not_allowed')
    m.role = role
    m.perms = { ...DEFAULTS[role] }
  }

  removeMember(persona: Persona, id: string): void {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const m = this.member(farm, id)
    if (m.role === 'owner') throw new MockError(403, 'not_allowed')
    farm.members = farm.members.filter((x) => x.id !== id)
    for (const p of Object.values(this.people)) if (p.memberId === id) p.farmId = null
  }

  permissions(persona: Persona, id: string): PermissionsResponse {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const m = this.member(farm, id)
    return { member: this.memberView(farm, m, me), pondsLabel: this.pondsLabel(farm, m.pondIds), perms: m.perms, defaults: DEFAULTS[m.role] }
  }

  patchPermissions(persona: Persona, id: string, body: PermissionsPatch): PermissionsResponse {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const m = this.member(farm, id)
    if (m.role === 'owner') throw new MockError(403, 'not_allowed')
    if ('key' in body) m.perms = { ...m.perms, [body.key]: body.value }
    else if ('role' in body) {
      m.role = body.role
      m.perms = { ...DEFAULTS[body.role] }
    } else m.perms = { ...DEFAULTS[m.role] }
    return this.permissions(persona, id)
  }

  createInvite(persona: Persona, body: InviteCreate, host: string): Invite {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const r = rng(`${Date.now()}${this.seq}`)
    const code = Array.from({ length: 7 }, () => CODE_CHARS[Math.floor(r() * CODE_CHARS.length)]).join('')
    const inv: MInvite = { code, role: body.role, pondIds: body.pondIds.filter((id) => farm.ponds.some((p) => p.id === id)), createdOn: TODAY, status: 'open' }
    farm.invites.push(inv)
    return this.inviteView(farm, inv, host)
  }

  cancelInvite(persona: Persona, code: string): void {
    const { farm, me } = this.ctx(persona)
    this.ownerOnly(me)
    const inv = farm.invites.find((i) => i.code === code)
    if (!inv) throw new MockError(404, 'not_found')
    inv.status = 'cancelled'
  }

  private findInvite(code: string): { farm: MFarm; inv: MInvite } {
    for (const farm of this.farms.values()) {
      const inv = farm.invites.find((i) => i.code === code.toUpperCase())
      if (inv) return { farm, inv }
    }
    throw new MockError(404, 'invite_invalid')
  }

  invitePreview(persona: Persona, code: string): InvitePreview {
    const { farm, inv } = this.findInvite(code)
    const owner = farm.members.find((m) => m.id === farm.ownerId)!
    const n = inv.pondIds.length
    return {
      code: inv.code,
      farmName: farm.name,
      pondCount: farm.ponds.length,
      ownerName: owner.name,
      role: inv.role,
      pondsLabel: n ? `${this.pondsLabel(farm, inv.pondIds)} · ${n} บ่อ` : 'ทุกบ่อ',
      suggestedName: this.people[persona].name,
      valid: inv.status === 'open',
      reason: inv.status === 'open' ? undefined : inv.status,
    }
  }

  acceptInvite(persona: Persona, code: string, body: InviteAccept): Session {
    const { farm, inv } = this.findInvite(code)
    if (inv.status !== 'open') throw new MockError(409, 'invite_invalid')
    const who = this.people[persona]
    const name = body.displayName.trim() || who.name
    farm.members = farm.members.filter((m) => m.id !== who.memberId)
    farm.members.push({ id: who.memberId, name, role: inv.role, pondIds: inv.pondIds, joined: TODAY, perms: { ...DEFAULTS[inv.role] } })
    inv.status = 'used'
    who.farmId = farm.id
    who.name = name
    farm.activity.unshift({ who: name, what: 'เข้าร่วมฟาร์ม', when: `วันนี้ ${fmtTime(nowIso())}` })
    return this.session(persona)
  }

  /* ----- settings ----- */

  settings(persona: Persona): SettingsResponse {
    const { farm } = this.ctx(persona)
    return { notify: farm.notify, nets: { count: farm.nets.length, sizes: farm.nets.map((n) => n.cm) } }
  }

  saveNotify(persona: Persona, patch: Partial<NotifySettings>): SettingsResponse {
    const { farm, me } = this.ctx(persona)
    if (me.role === 'worker') throw new MockError(403, 'not_allowed')
    farm.notify = { ...farm.notify, ...patch }
    return this.settings(persona)
  }

  /* ----- print ----- */

  farmSheet(persona: Persona): FarmSheet {
    const { farm, me } = this.ctx(persona)
    this.need(me, 'printSheet')
    const o = this.overview(persona)
    const tiles = farm.ponds.map((p) => this.tile(farm, p, me))
    const caretakerOf = (id: string) => tiles.find((t) => t.id === id)?.caretaker ?? null
    const order: Record<string, number> = { urgent: 0, missing: 1, watch: 2 }
    return {
      farmName: farm.name,
      date: TODAY,
      printedAt: at(TODAY, '07:00'),
      targetPerKg: farm.targetPerKg,
      photosToday: { sent: o.photosToday.sent, total: o.photosToday.total },
      tiles: o.tiles,
      queue: [...o.soon.rows.map((r) => ({ ...r, soon: true })), ...o.later.rows.map((r) => ({ ...r, soon: false }))].map((r) => ({ ...r, caretaker: caretakerOf(r.pondId) })),
      watch: tiles
        .filter((t) => t.status === 'urgent' || t.status === 'missing' || t.status === 'watch')
        .sort((a, b) => order[a.status]! - order[b.status]! || a.code.localeCompare(b.code))
        .map((t) => ({ pondCode: t.code, kind: t.status as 'urgent' | 'missing' | 'watch', caretaker: t.caretaker, issue: t.issue ?? '', perKg: t.perKg })),
      zones: [...new Set(tiles.map((t) => t.zone))].map((zone) => ({ zone, caretaker: tiles.find((t) => t.zone === zone)?.caretaker ?? null, ponds: tiles.filter((t) => t.zone === zone) })),
    }
  }

  pondSheet(persona: Persona, id: string): PondSheet {
    const { farm, me } = this.ctx(persona)
    this.need(me, 'printSheet')
    const p = this.pond(farm, id)
    const last = this.saved(farm, p.id)[0]
    if (!last?.result) throw new MockError(404, 'not_found')
    return {
      farmName: farm.name,
      pond: this.tile(farm, p, me),
      scan: this.summary(farm, last, me),
      result: last.result,
      photoWidth: last.width,
      photoHeight: last.height,
      growth: this.growth(farm, p),
      targetPerKg: farm.targetPerKg,
    }
  }

  sendSheet(persona: Persona, body: { sheet: 'farm' } | { sheet: 'pond'; pondId: string }): { sent: number } {
    const { me } = this.ctx(persona)
    this.need(me, 'printSheet')
    return { sent: body.sheet === 'farm' ? 2 : 1 }
  }
}

/* ---------- module helpers ---------- */

function dayOf(instant: string): string {
  return new Date(new Date(instant).getTime() + 7 * 3600_000).toISOString().slice(0, 10)
}

export function photoUrl(photo: string): string {
  return `/mock-photos/${encodeURIComponent(photo)}`
}

/** Width and height from a JPEG's SOF marker or a PNG's IHDR; null when neither. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]!
    const len = b.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
    }
    i += 2 + len
  }
  return null
}
