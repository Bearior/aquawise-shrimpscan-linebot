/**
 * The story the mock tells, from docs/shrimp-scan-flow-mock: ฟาร์มสายน้ำ,
 * 60 ponds in zones A to F, พี่วิชัย the owner, ช่างเอก the worker on F01 to
 * F10. Numbers are the design canvas's own (the Z2 table of the A4 sheet).
 *
 * Mock "today" is Tuesday 20 ต.ค. 2569, the day the mock's owner screens show.
 */
import type { Pt, Role } from '../src/api/types'

export const TODAY = '2026-10-20'

/** Mock time of day for things that happen "now": 07:30 Bangkok. */
export function nowIso(): string {
  return `${TODAY}T00:30:00.000Z`
}

/** 'HH:MM' Bangkok on TODAY as an ISO instant. */
export function at(day: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const d = new Date(`${day}T00:00:00.000Z`)
  d.setUTCHours(h - 7, m)
  return d.toISOString()
}

/** Zone, caretaker, and per pond: ตัว/กก.|grams|grams a day|(unused)|kind. */
export const Z2: [string, string, string][] = [
  ['A', 'ลุงพล', '39|25.4|0.38|วันนี้|r;56|17.8|0.29|15 พ.ย.|w;52|19.2|0.30|9 พ.ย.|g;41|24.6|0.38|22 ต.ค.|r;53|18.8|0.33|8 พ.ย.|g;52|19.3|0.33|7 พ.ย.|g;42|23.8|0.31|25 ต.ค.|r;52|19.2|0.31|9 พ.ย.|w;43|23.3|0.37|25 ต.ค.|r;50|20.1|0.37|3 พ.ย.|g'],
  ['B', 'พี่ชาติ', '63|15.9|0.31|19 พ.ย.|g;41|24.2|0.38|23 ต.ค.|r;53|18.9|0.36|7 พ.ย.|g;59|17.1|0.30|17 พ.ย.|g;44|22.9|0.31|27 ต.ค.|g;57|17.6|0.37|10 พ.ย.|g;65|15.3|0.30|23 พ.ย.|w;53|19.0|0.37|6 พ.ย.|g;54|18.7|0.34|8 พ.ย.|g;57|17.6|0.29|15 พ.ย.|g'],
  ['C', 'น้าศักดิ์', '45|22.4|0.37|28 ต.ค.|g;69|14.6|0.33|22 พ.ย.|g;72|13.9|0.25|1 ธ.ค.|u;65|15.4|0.30|21 พ.ย.|g;82|12.2|0.30|3 ธ.ค.|g;79|12.7|0.29|3 ธ.ค.|g;70|14.2|0.33|23 พ.ย.|g;70|14.2|0.31|26 พ.ย.|g;58|17.4|0.37|10 พ.ย.|g;70|14.2|0.35|20 พ.ย.|g'],
  ['D', 'น้าศักดิ์', '63|15.8|0.34|17 พ.ย.|g;55|18.2|0.19|21 พ.ย.|u;56|18.0|0.34|10 พ.ย.|g;53|18.9|0.35|7 พ.ย.|g;57|17.7|0.32|13 พ.ย.|g;70|14.2|0.31|25 พ.ย.|g;70|14.2|0.25|30 พ.ย.|u;60|16.7|0.34|14 พ.ย.|g;55|18.2|0.35|9 พ.ย.|g;55|18.1|0.33|10 พ.ย.|g'],
  ['E', 'บังดล', '87|11.5|0.31|3 ธ.ค.|g;86|11.7|0.33|30 พ.ย.|g;78|12.8|0.36|24 พ.ย.|m;79|12.7|0.31|29 พ.ย.|g;87|11.5|0.38|26 พ.ย.|g;86|11.6|0.38|26 พ.ย.|g;87|11.5|0.30|6 ธ.ค.|m;87|11.5|0.30|6 ธ.ค.|g;73|13.7|0.36|21 พ.ย.|g;87|11.5|0.32|1 ธ.ค.|g'],
  ['F', 'ช่างเอก', '79|12.7|0.31|1 ธ.ค.|g;76|13.1|0.29|2 ธ.ค.|g;67|14.9|0.32|22 พ.ย.|g;66|15.1|0.25|27 พ.ย.|u;60|16.6|0.31|17 พ.ย.|g;53|18.9|0.32|8 พ.ย.|g;79|12.6|0.32|28 พ.ย.|g;87|11.5|0.19|21 ธ.ค.|u;65|15.4|0.34|18 พ.ย.|g;58|17.2|0.37|10 พ.ย.|g'],
]

/** Stocking counts the queue's tonnes come from (the rest are generated). */
export const STOCKED: Record<string, number> = {
  A01: 200_000,
  A04: 220_000,
  B02: 180_000,
  A07: 245_000,
  A09: 240_000,
  B05: 210_000,
  C01: 260_000,
  A10: 220_000,
}

export interface PersonSeed {
  id: string
  name: string
  role: Role
  zones: string[]
  joined: string
}

export const PEOPLE: PersonSeed[] = [
  { id: 'm-wichai', name: 'พี่วิชัย', role: 'owner', zones: ['A', 'B', 'C', 'D', 'E', 'F'], joined: '2026-08-01' },
  { id: 'm-sak', name: 'น้าศักดิ์', role: 'manager', zones: ['C', 'D'], joined: '2026-08-12' },
  { id: 'm-phon', name: 'ลุงพล', role: 'worker', zones: ['A'], joined: '2026-09-02' },
  { id: 'm-chat', name: 'พี่ชาติ', role: 'worker', zones: ['B'], joined: '2026-09-02' },
  { id: 'm-don', name: 'บังดล', role: 'worker', zones: ['E'], joined: '2026-09-09' },
  { id: 'm-ek', name: 'ช่างเอก', role: 'worker', zones: ['F'], joined: '2026-10-19' },
]

/** The ยอ rim on the fixture photo, in the mock's 760 x 674 units. */
const GUESS_PX: [number, number][] = [
  [330, 16],
  [690, 300],
  [402, 620],
  [96, 356],
]
const FIXED_PX: [number, number][] = [
  [327, 44],
  [652, 306],
  [398, 619],
  [97, 354],
]
const norm = ([x, y]: [number, number]): Pt => ({ x: x / 760, y: y / 674 })
/** น้ำ's first guess on the fixture: a little wide on the right (point 2). */
export const GUESS: Pt[] = GUESS_PX.map(norm)
/** The rim on the floor edge of the fixture net. */
export const FIXED: Pt[] = FIXED_PX.map(norm)

/** The 64 shrimp found on the fixture photo, as แบบ 2 placed them. */
const DOTS_PX: [number, number, string][] = [
  [403, 126, 's'], [409, 179, 'm'], [425, 140, 'm'], [455, 103, 's'], [495, 79, 's'], [506, 104, 's'], [461, 197, 's'], [421, 271, 's'],
  [524, 167, 's'], [490, 232, 's'], [478, 248, 'l'], [529, 215, 's'], [594, 182, 'm'], [469, 291, 's'], [513, 274, 'm'], [479, 294, 'm'],
  [596, 266, 'l'], [564, 306, 'm'], [487, 323, 'm'], [592, 349, 'm'], [425, 337, 'm'], [504, 358, 'm'], [523, 380, 'm'], [495, 382, 's'],
  [522, 465, 'm'], [478, 431, 's'], [440, 398, 'm'], [511, 499, 's'], [377, 334, 'm'], [407, 382, 'm'], [442, 449, 's'], [459, 549, 's'],
  [398, 400, 'm'], [423, 514, 's'], [405, 584, 'l'], [380, 427, 'm'], [356, 566, 'm'], [321, 455, 'm'], [342, 393, 'm'], [316, 420, 'm'],
  [343, 361, 's'], [266, 389, 'm'], [160, 362, 'm'], [107, 368, 'm'], [126, 344, 'm'], [246, 335, 's'], [125, 324, 'm'], [213, 326, 'l'],
  [182, 305, 's'], [140, 256, 'm'], [351, 320, 'm'], [358, 310, 'l'], [344, 330, 'l'], [141, 223, 's'], [270, 283, 'm'], [152, 209, 'm'],
  [249, 244, 'l'], [196, 205, 'l'], [223, 118, 'm'], [245, 143, 'l'], [329, 218, 'm'], [315, 153, 'm'], [338, 202, 's'], [314, 92, 'm'],
]
const BAND_ORDER: Record<string, number> = { s: 0, m: 1, l: 2 }
/** Dots ordered small to large, so sorted weights land on matching dots. */
export const DOTS: Pt[] = [...DOTS_PX].sort((a, b) => BAND_ORDER[a[2]]! - BAND_ORDER[b[2]]!).map(([x, y]) => norm([x, y]))

/** The fixture photo's size: 760 x 674 in the mock, 520 x 461 as shipped. */
export const FIXTURE_ASPECT = 760 / 674

/**
 * The square ยอ fixture (dev-mock/fixtures/yor-square.jpg, a Codex-made
 * illustration, same aspect as yor.jpg): แบบ 2's corners and its 54 shrimp.
 * A fixture-sized upload into a pond whose ยอ is square reads as this one.
 */
const SQ_GUESS_PX: [number, number][] = [
  [88, 46],
  [694, 62],
  [683, 646],
  [72, 626],
]
const SQ_FIXED_PX: [number, number][] = [
  [107.3, 68.2],
  [667.4, 77.3],
  [680.9, 640.7],
  [73.8, 623.6],
]
export const SQ_GUESS: Pt[] = SQ_GUESS_PX.map(norm)
export const SQ_FIXED: Pt[] = SQ_FIXED_PX.map(norm)
const SQ_DOTS_PX: [number, number, string][] = [
  [385, 265, 'm'], [395, 193, 'm'], [408, 126, 'm'], [417, 264, 'm'], [475, 124, 's'], [473, 155, 's'], [462, 194, 's'], [442, 277, 'm'],
  [540, 169, 's'], [483, 235, 's'], [526, 240, 's'], [609, 185, 's'], [598, 227, 'm'], [512, 281, 'l'], [555, 270, 's'], [514, 314, 'm'],
  [435, 342, 'l'], [592, 362, 'l'], [535, 383, 'm'], [595, 448, 'm'], [469, 400, 'l'], [519, 433, 'l'], [596, 538, 'm'], [540, 495, 'm'],
  [507, 552, 'm'], [401, 398, 'm'], [443, 579, 'm'], [426, 537, 'l'], [372, 512, 'm'], [375, 438, 's'], [342, 480, 'm'], [265, 567, 's'],
  [287, 480, 's'], [338, 401, 'm'], [203, 503, 's'], [108, 553, 's'], [132, 517, 'm'], [203, 438, 'm'], [214, 391, 'm'], [141, 371, 'l'],
  [279, 358, 'm'], [131, 298, 's'], [205, 300, 'm'], [146, 262, 'm'], [261, 290, 's'], [188, 216, 's'], [231, 236, 'm'], [330, 291, 'l'],
  [237, 165, 'm'], [285, 190, 'm'], [294, 125, 'm'], [338, 238, 'm'], [331, 200, 'm'], [381, 307, 'm'],
]
export const SQ_DOTS: Pt[] = [...SQ_DOTS_PX].sort((a, b) => BAND_ORDER[a[2]]! - BAND_ORDER[b[2]]!).map(([x, y]) => norm([x, y]))

/** A04's note from ลุงพล (W21's chips, shown on O23). */
export const NOTES: Record<string, { by: string; hhmm: string; text: string }> = {
  A04: { by: 'ลุงพล', hhmm: '07:28', text: 'กินดี · เปลือกเงา' },
}

/** F10's own history (E2): the line that drops when the rim was wide. */
export const F10_HISTORY: [string, number][] = [
  ['2026-10-05', 12.6],
  ['2026-10-10', 14.3],
  ['2026-10-15', 15.6],
]

export const ACTIVITY: { who: string; what: string; when: string }[] = [
  { who: 'ลุงพล', what: 'สแกนกุ้ง · A04', when: 'วันนี้ 07:28' },
  { who: 'บังดล', what: 'ส่งรูปยอ · E05', when: 'วันนี้ 06:50' },
  { who: 'พี่วิชัย', what: 'วัดรูป · F09', when: 'วันนี้ 07:02' },
  { who: 'น้าศักดิ์', what: 'แก้ขอบยอ · C03', when: 'เมื่อวาน 17:12' },
]

/** The other farm, found through น้องน้ำ for the `new` persona (O2). No ยอ yet. */
export const CANDIDATE = {
  id: 'farm-banphaeo',
  name: 'ฟาร์มบ้านแพ้ว',
  ownerName: 'พี่สมชาย',
  zones: ['A', 'B'],
  perZone: 6,
  members: 3,
}
