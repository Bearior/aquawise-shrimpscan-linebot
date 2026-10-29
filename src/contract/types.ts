/**
 * The LIFF API contract: every `/api/liff/*` request and response.
 *
 * Dependency free on purpose. The backend-free mock (dev-mock/mock-api.ts)
 * imports this file by relative path and is type-checked against it, so when
 * the contract changes, the mock fails `tsc` instead of drifting. The real
 * server routes (not built yet) answer 501 until they implement these shapes.
 *
 * Conventions:
 * - Dates are ISO calendar days in Asia/Bangkok ('2026-10-20'); instants are
 *   ISO timestamps.
 * - Photo coordinates (rim points, shrimp) are normalized 0..1 of the photo's
 *   own width and height, so they survive any display size.
 * - Identity is the verified LIFF token only. No request carries a LINE user id.
 */

export type Role = 'owner' | 'manager' | 'worker'
export type NetShape = 'round' | 'square'
/** r ready within 5 days · g growing well · w watch · u urgent · m no photo today */
export type PondStatus = 'ready' | 'good' | 'watch' | 'urgent' | 'missing'

export interface Pt {
  x: number
  y: number
}

/* ---------- session ---------- */

/**
 * What a person may do beyond the daily job. Everyone in a farm scans the
 * ponds they look after, into the pond, every day; that is not a switch.
 * A worker never sees sizes or results, so the server holds the four
 * number-showing keys off for a worker whatever is stored.
 */
export interface Permissions {
  /** แก้ขอบยอผลของคนอื่น. Your own scans are always editable (not a worker's: they see no result). */
  editOthers: boolean
  /** วัดรูปที่คนอื่นส่ง (the inbox). */
  measureInbox: boolean
  /** ดูภาพรวมทั้งฟาร์ม. */
  farmOverview: boolean
  /** พิมพ์ใบผลสแกน. */
  printSheet: boolean
  /** เตือนเมื่อยังไม่สแกน. */
  remindMissing: boolean
}
export type PermissionKey = keyof Permissions

export interface FarmRef {
  id: string
  name: string
  pondCount: number
  zoneCount: number
  memberCount: number
  /** 'พี่วิชัย': a worker's note chips say who they are for. */
  ownerName: string
  /** จับขายที่ไซส์ (ตัว/กก.). Every "ถึงไซส์" number derives from it. */
  targetPerKg: number
}

/** A farm found through the person's น้องน้ำ account (same LINE provider). */
export interface FarmCandidate {
  id: string
  name: string
  pondCount: number
  zoneCount: number
  memberCount: number
  /** Where we found it, said to the person: "จากบัญชีน้องน้ำของพี่วิชัย". */
  source: string
}

export interface Session {
  user: { name: string }
  farm: FarmRef | null
  role: Role | null
  permissions: Permissions
  /** Pond ids this person looks after (all ponds for an owner). */
  pondIds: string[]
  /** Scans the farm can still pay for today. */
  creditsLeft: number
  today: string
  /** Set when the person has no farm in this OA yet but has one in น้องน้ำ. */
  candidate: FarmCandidate | null
  /** The LIFF env, shown as a chip off production. */
  env: string
}

/* ---------- start (O2 to O6) ---------- */

export type StartRequest = { useFarmId: string } | { name: string; ponds: string[] }

/* ---------- ponds ---------- */

export interface PondTile {
  id: string
  code: string
  zone: string
  caretaker: string | null
  perKg: number | null
  abw: number | null
  /** Grams a day over the recent scans. */
  gPerDay: number | null
  /** Day the pond reaches the farm's target size; null when unknown. */
  reachOn: string | null
  daysToTarget: number | null
  status: PondStatus
  /** Scanned into the pond today. */
  photoToday: boolean
  /** The caller looks after this pond. */
  mine: boolean
  /** Short reason for watch/urgent, e.g. 'โตช้ามาก วันละ 0.19 ก.'. */
  issue: string | null
  /** Days since stocking, when known. */
  ageDays: number | null
  /** The ยอ this pond is measured against (its own, or the farm's). */
  netId: string | null
}

export interface ZoneSummary {
  zone: string
  caretaker: string | null
  total: number
  photoToday: number
}

export interface PondsResponse {
  zones: ZoneSummary[]
  ponds: PondTile[]
}

export interface GrowthPoint {
  /** Days since stocking. */
  day: number
  abw: number
  date: string
  /** Standard deviation of the weights at that scan, grams. Missing when not known: the chart draws no band there. */
  sd?: number | null
}

export interface Stocking {
  stockedOn: string | null
  count: number | null
  /** 0..1, or null for ไม่แน่ใจ. */
  survival: number | null
}

export interface PondDetail {
  pond: PondTile
  growth: GrowthPoint[]
  /** Latest saved scan's sizes, for the distribution. */
  latest: ScanSummary | null
  latestShrimpGrams: number[]
  stocking: Stocking
  /** Estimated tonnes in the pond now, from stocking and the latest weight. */
  tonnesNow: number | null
  /** Notes a worker left with a scan (กินดี · เปลือกเงา). */
  note: { by: string; at: string; text: string } | null
  /** Neighbours in the farm's order, for the ‹ A03 · A05 › row. */
  prevId: string | null
  prevCode: string | null
  nextId: string | null
  nextCode: string | null
  /** Chance of reaching the target on time, 0..1, when there is enough data. */
  onTimeChance: number | null
}

/* ---------- nets (ยอ) ---------- */

export interface Net {
  id: string
  shape: NetShape
  /** Whole cm, 30 to 200. */
  cm: number
  /** 'ยอของฟาร์ม' or the ponds it is set for, e.g. 'E01 ถึง E10'. */
  use: string
  pondCount: number
  /** 'พี่วิชัยใส่ 20 ต.ค.' */
  addedBy: string
  addedOn: string
  isFarmDefault: boolean
}

export const NET_CM_MIN = 30
export const NET_CM_MAX = 200

export interface NetsResponse {
  nets: Net[]
}

export interface NetEdit {
  cm: number
  shape?: NetShape
}

export interface NetCreate {
  shape: NetShape
  cm: number
  /** Make this the farm's ยอ (the first one always is). */
  farmDefault?: boolean
  /** Use it for this pond from now on. */
  pondId?: string
}

/* ---------- scans ---------- */

export interface ScanResult {
  abw: number
  perKg: number
  lengthCm: number
  count: number
  /** Coefficient of variation of the weights, 0..1. */
  cv: number
  /** Every shrimp found inside the rim: position and grams. */
  shrimp: { x: number; y: number; g: number }[]
  rim: Pt[]
  net: { id: string; shape: NetShape; cm: number }
  measuredAt: string
  /** Free re-measures left on this photo (rim edits, net changes). */
  remeasuresLeft: number
  /** The pond's previous saved scan, for the lighter-than-before warning. */
  previous: { abw: number; date: string } | null
}

export interface Scan {
  id: string
  pondId: string
  pondCode: string
  photoUrl: string
  /** Photo size in px, for the aspect ratio. */
  width: number
  height: number
  /** น้ำ's first guess of the 4 rim points. */
  rimGuess: Pt[]
  /** Net this pond uses; null means ask (the first scan of the farm). */
  net: Net | null
  photoBy: string
  photoAt: string
  status: 'waiting' | 'measured' | 'saved' | 'asked_again'
  /** The measured sizes. Always null for a worker: they get `found` instead. */
  result: ScanResult | null
  /** Once measured, where น้ำ found each shrimp, with no size: all a worker gets back. */
  found: Pt[] | null
  /** Who measured and who may fix it. */
  measuredBy: string | null
  canFix: boolean
}

export interface ScanCreateResponse {
  scan: Scan
}

export interface MeasureRequest {
  rim: Pt[]
  netId: string
}

export interface MeasureResponse {
  scan: Scan
  creditsLeft: number
}

export interface SaveRequest {
  /** Note chips for the owner (กินดี, ตัวนิ่ม ...), worker only. */
  notes?: string[]
}

export interface SaveResponse {
  pondId: string
  pondCode: string
  /** The person's ponds scanned today, this one included, and how many they look after. */
  doneToday: number
  mineTotal: number
  /** When the pond now reaches the farm's target size, if known. Null for a worker. */
  reachOn: string | null
}

export interface FixRequest {
  rim: Pt[]
}

export interface FixResponse {
  before: ScanResult
  after: ScanResult
}

export interface FixApplyRequest {
  use: 'new' | 'old'
  rim: Pt[]
}

export interface ScanSummary {
  scanId: string
  date: string
  at: string
  abw: number
  perKg: number
  cv: number
  photoUrl: string
  photoBy: string
  measuredBy: string
  /** Set after a rim fix: who fixed it and the old result. */
  fixed: { by: string; at: string; oldPerKg: number } | null
  lighter: boolean
  canFix: boolean
}

export interface PondScansResponse {
  pond: PondTile
  scans: ScanSummary[]
}

/* ---------- worker: today (W23) ---------- */

/**
 * One pond on a worker's list for today. No sizes on purpose: a worker
 * scans and sends; only the owner's side sees what the scan said.
 */
export interface TodayRow {
  pondId: string
  pondCode: string
  /** The ยอ this pond is measured against, for the chip on the photo step. */
  netId: string | null
  /** Today's saved scan of this pond, by anyone; null until then. */
  scanId: string | null
  by: string | null
  at: string | null
  photoUrl: string | null
}

export interface TodayResponse {
  /** Ponds scanned today. */
  done: number
  total: number
  rows: TodayRow[]
}

/* ---------- owner: who scanned today (O39) ---------- */

export interface TeamPond {
  pondId: string
  pondCode: string
  /** When today's scan was saved, and by whom (the owner may scan for someone). */
  at: string | null
  by: string | null
}

export interface TeamPerson {
  memberId: string
  name: string
  role: Exclude<Role, 'owner'>
  /** 'F01 ถึง F10'. */
  pondsLabel: string
  done: number
  total: number
  /** The latest scan today: the time a finished person finished. */
  lastAt: string | null
  ponds: TeamPond[]
}

export interface TeamTodayResponse {
  today: string
  done: number
  total: number
  /** Everyone who looks after ponds, the ones with ponds left first. */
  people: TeamPerson[]
  /** Ponds no one looks after: nobody is asked to scan them. */
  nobody: TeamPond[]
  /** When น้ำ reminds the people with ponds left ('10:00'); null when the reminder is off. */
  remindAt: string | null
}

/* ---------- owner: inbox (O13 to O18) ---------- */

export interface InboxPhoto {
  scanId: string
  pondId: string
  pondCode: string
  photoUrl: string
  by: string
  at: string
  /** The quick check at receive time. */
  quality: 'ok' | 'maybe_cut' | 'dark' | 'blurry'
}

export interface InboxResponse {
  photos: InboxPhoto[]
  creditsLeft: number
  /** Per sender, for the filter chips. */
  senders: { name: string; n: number }[]
}

export type AskAgainReason = 'dark' | 'blurry' | 'cut' | 'pile' | 'other'

/* ---------- owner: overview (O21) ---------- */

export interface QueueRow {
  pondId: string
  pondCode: string
  date: string
  perKg: number
  abw: number
  tonnes: number
}

/**
 * One เรื่องน่าจับตา row (O21), the way line-bot's home v8 has it. The server
 * decides which items exist, their order, their words, and whether รับทราบ
 * applies. An item that leaves by being done (a pond not scanned yet) has no
 * รับทราบ; it goes when the pond is scanned.
 */
export interface WatchItem {
  /** Stable for one fact: `harvest-F07`, `slow`, `missing`. */
  key: string
  kind: 'harvest' | 'slow' | 'missing'
  title: string
  /** The when-chip: วันนี้, พรุ่งนี้, อีก 3 วัน, ตรวจดู. */
  chip: string
  /** soon = blue, alert = amber, plain = grey. */
  tone: 'soon' | 'alert' | 'plain'
  /** One or two lines; `**bold**` marks the numbers. */
  detail: string
  /** "หายไปเองเมื่อ…" for an item that leaves by being done, else null. */
  auto: string | null
  /** The blue button: open the pond, the ต้องดู list, or who scanned today. */
  action: { label: string; to: 'pond' | 'urgent' | 'team'; pondId?: string } | null
  ackable: boolean
  /** Changes when the fact changes, so an old รับทราบ never hides a new fact. */
  signature: string
  /** Farm-wide: who said รับทราบ and when (HH:MM). Null while it is open. */
  acked: WatchAck | null
}

export interface WatchAck {
  by: string
  at: string
}

/** PUT /watch/:key/ack */
export interface WatchAckPut {
  signature: string
}

export interface Overview {
  farmName: string
  today: string
  pondCount: number
  targetPerKg: number
  /** เรื่องน่าจับตา, in the order to show them, acknowledged ones included. */
  watch: WatchItem[]
  tiles: {
    ready: { n: number; tonnes: number }
    good: { n: number }
    watch: { n: number }
    urgent: { n: number; slow: number; missing: number }
  }
  /** Ponds scanned today (the field name is from when photos were sent in the chat). */
  photosToday: { sent: number; total: number; missing: string[] }
  /** 14 days from today: how many ponds reach the target each day. */
  queueDays: { date: string; n: number }[]
  soon: { rows: QueueRow[]; tonnes: number }
  later: { rows: QueueRow[]; tonnes: number }
  beyond: { from: number; to: number | null; ponds: number; tonnes: number }[]
}

/* ---------- people (O7 to O11) ---------- */

export interface Member {
  id: string
  name: string
  role: Role
  /** 'ดูแล 10 บ่อ · วันนี้ 10/10', 'ทุกบ่อ'. */
  scope: string
  /** 'เข้าร่วม 2 ก.ย. 2569', 'เจ้าของฟาร์ม'. */
  joined: string
  isYou: boolean
}

export interface Invite {
  code: string
  url: string
  role: Role
  pondsLabel: string
  expiresOn: string
  daysLeft: number
}

export interface MembersResponse {
  members: Member[]
  invites: Invite[]
  activity: { who: string; what: string; when: string }[]
  /** Zones nobody looks after, for น้ำ's line at the top. */
  uncoveredZones: string[]
}

export interface InviteCreate {
  role: Exclude<Role, 'owner'>
  pondIds: string[]
}

export interface InvitePreview {
  code: string
  farmName: string
  pondCount: number
  ownerName: string
  role: Role
  pondsLabel: string
  /** Prefilled from the LINE profile; the person can change it. */
  suggestedName: string
  valid: boolean
  /** 'expired' | 'used' | 'cancelled' when not valid. */
  reason?: string
}

export interface InviteAccept {
  displayName: string
  lang: 'th' | 'my'
  addFriend: boolean
}

/** Which ponds one person looks after (O40). A pond has one caretaker. */
export interface MemberPondsResponse {
  member: Member
  pondIds: string[]
  /** Every pond of the farm; `heldBy` names another person who looks after it now. */
  ponds: { id: string; code: string; zone: string; heldBy: string | null }[]
}

export interface MemberPondsPut {
  /** Ponds held by someone else move to this person. */
  pondIds: string[]
}

export interface PermissionsResponse {
  member: Member
  pondsLabel: string
  perms: Permissions
  /** The role's defaults; a perm that differs is shown as ปรับเอง. */
  defaults: Permissions
}

export type PermissionsPatch = { key: PermissionKey; value: boolean } | { role: Exclude<Role, 'owner'> } | { reset: true }

/* ---------- settings (O25) ---------- */

export interface NotifySettings {
  photoIn: boolean
  morningSummary: boolean
  morningSheet: boolean
  nearTarget: boolean
  remindWorkers: boolean
}

export interface SettingsResponse {
  notify: NotifySettings
  nets: { count: number; sizes: number[] }
}

/* ---------- print (O32 to O34) ---------- */

export interface FarmSheet {
  farmName: string
  date: string
  printedAt: string
  targetPerKg: number
  photosToday: { sent: number; total: number }
  tiles: Overview['tiles']
  queue: (QueueRow & { caretaker: string | null; soon: boolean })[]
  watch: { pondCode: string; kind: 'urgent' | 'missing' | 'watch'; caretaker: string | null; issue: string; perKg: number | null }[]
  zones: { zone: string; caretaker: string | null; ponds: PondTile[] }[]
}

export interface PondSheet {
  farmName: string
  pond: PondTile
  /** The latest saved scan: who, when, the photo. */
  scan: ScanSummary
  /** Its full result: rim, every shrimp, length, the ยอ it used. */
  result: ScanResult
  photoWidth: number
  photoHeight: number
  growth: GrowthPoint[]
  targetPerKg: number
}

/* ---------- errors ---------- */

/** Error codes the screens react to. Anything else shows the generic error. */
export type ApiErrorCode =
  | 'no_credits'
  | 'not_allowed'
  | 'remeasure_limit'
  | 'net_out_of_range'
  | 'invite_invalid'
  | 'not_found'
  | 'not_built_yet'
  | 'liff_not_configured'
