/**
 * Rows as the routes see them, and the repositories that read and write them.
 *
 * Two implementations: `supabase/` (the shared database) and `memory.ts` (every
 * route test). Routes only ever see `Repos`.
 */

import type { NotifySettings, Permissions, Role, Stocking } from '../contract/types.js'

/** The mark a farm made by this OA carries (migration 211). */
export const OA_CREATED_VIA = 'shrimp_scan_oa'

export interface FarmRow {
  id: string
  name: string
  /** The farm key: the owner's LINE user id. */
  createdBy: string
  createdVia: string | null
  accessLevel: string
}

export type MemberStatus = 'active' | 'invited' | 'left' | 'removed' | 'declined'

export interface MemberRow {
  id: string
  farmId: string
  lineUserId: string
  role: Role
  /** '' when the row has no display name. */
  name: string
  /** The ponds this person looks after (an owner looks after every pond). */
  pondIds: string[]
  status: MemberStatus
  /** `joined_at`; missing on a row the test did not date. */
  joinedAt?: string | null
  /** What the person may do, set by `resolveContext` from the role and the owner's switches. */
  perms?: Permissions
}

export interface PondRow {
  id: string
  farmId: string
  /** The pond's name in `ponds.name`: 'A01'. */
  code: string
  netId: string | null
}

/** A ยอ (`farm_nets`). The farm's default is its oldest live one. */
export interface NetRow {
  id: string
  farmId: string
  /** `diameter_cm`: the ยอ is round. */
  cm: number
  createdBy: string | null
  createdAt: string
  archivedAt: string | null
}

/** A scan (`sizing_measurements`), as far as the pond pages read it. */
export interface ScanRow {
  id: string
  farmId: string
  pondId: string
  /** Who sent the photo (and measured it). */
  lineUserId: string
  status: string
  /** The day it was saved into the pond; null until it is. */
  sampleDate: string | null
  measuredAt: string | null
  createdAt: string
  abw: number | null
  /** `abw_lo_g` / `abw_hi_g`: the measure's range. */
  abwLo: number | null
  abwHi: number | null
  perKg: number | null
  /** 0..1. The column holds the percent, as line-bot writes it. */
  cv: number | null
  n: number | null
  /** `remeasure`, `note:<text>`, `fixed:<userTag>:<oldPerKg>`. */
  flags: string[]
  imageFileId: string | null
  /** The ยอ the photo was measured with. */
  netId: string | null
  /** `rim_ellipse` `[cx/W, cy/H, a/W, b/W, theta]`: น้ำ's guess until measured, then the ring it was measured on. */
  rim: number[] | null
  /** `ref_diameter_cm`: the ยอ size it was measured at. */
  refCm: number | null
  /** The service's flattened canvas: the rim's radius and the canvas's side, in canvas px. */
  rimRadiusPx: number | null
  canvasPx: number | null
  /** `shrimp_xy`: x0, y0, x1, y1 ... of each shrimp found, 0..1 of the canvas. */
  shrimpXy: number[] | null
  /** `shrimp_len_px` (line-bot migration 210): each shrimp's length in canvas px, in shrimp_xy order. Null on a database without it. */
  lenPx: number[] | null
  /** SAM3 calls and HTTP attempts so far: only ever added to (the spend trigger logs each change). */
  sam3Calls: number | null
  sam3HttpAttempts: number | null
}

/** The measure's own fields on a scan that has none yet. */
export const UNMEASURED: Pick<ScanRow, 'abwLo' | 'abwHi' | 'refCm' | 'rimRadiusPx' | 'canvasPx' | 'shrimpXy' | 'lenPx' | 'sam3Calls' | 'sam3HttpAttempts'> = {
  abwLo: null,
  abwHi: null,
  refCm: null,
  rimRadiusPx: null,
  canvasPx: null,
  shrimpXy: null,
  lenPx: null,
  sam3Calls: null,
  sam3HttpAttempts: null,
}

/** One write to a scan: only the fields given change. */
export type ScanPatch = Partial<
  Pick<
    ScanRow,
    | 'status' | 'sampleDate' | 'measuredAt' | 'abw' | 'abwLo' | 'abwHi' | 'perKg' | 'cv' | 'n' | 'flags' | 'netId' | 'rim'
    | 'refCm' | 'rimRadiusPx' | 'canvasPx' | 'shrimpXy' | 'lenPx' | 'sam3Calls' | 'sam3HttpAttempts'
  >
> & {
  sampleDateSource?: 'farmer' | null
  retakeReason?: string | null
  errorCode?: string | null
  pxLengths?: number[] | null
  pipelineVersion?: string | null
}

export interface ScanCreateInput {
  farmId: string
  pondId: string
  lineUserId: string
  /** `photo_sha256`: one scan per photo per farm (`sizing_measurements_farm_sha256`). */
  sha256: string
  flags: string[]
}

/** A pond's open cycle (state setup, preparing or active). */
export interface CycleRow extends Stocking {
  id: string
  pondId: string
}

export interface CreateOaFarmInput {
  ownerId: string
  /** The owner's LINE display name, when the token carried one. */
  ownerName: string | null
  name: string
  pondCodes: string[]
}

export interface FarmsRepo {
  byId(id: string): Promise<FarmRow | null>
  /**
   * The farm, its owner's self-membership and its ponds, with the owner's
   * `line_users` row stamped scan_only first. Throws `ApiError(403,
   * 'not_allowed')` for an erased account, with nothing written.
   */
  createOaFarm(input: CreateOaFarmInput): Promise<FarmRow>
  /** จับขายที่ไซส์ (ตัว/กก.); the default when the farm never set one. */
  target(farmId: string): Promise<number>
  setTarget(farmId: string, targetPerKg: number): Promise<void>
  /** The farm this OA made whose key (`created_by`) is this LINE id; null when there is none. */
  oaFarmOfKey(farmKey: string): Promise<FarmRow | null>
}

export interface MembersRepo {
  /** The person's active membership, newest first; null when there is none. */
  activeFor(lineUserId: string): Promise<MemberRow | null>
  /** Everyone active in the farm, oldest first. */
  ofFarm(farmId: string): Promise<MemberRow[]>
  /** The farm's active member with this row id; null for anyone else. */
  byId(farmId: string, id: string): Promise<MemberRow | null>
  setRole(id: string, role: Exclude<Role, 'owner'>): Promise<void>
  /** The ponds this person looks after (`pond_ids`, with `scope` to match). */
  setPonds(id: string, pondIds: string[]): Promise<void>
  /** `status 'removed'`: the row stays, so a new invite brings the person back. */
  remove(id: string): Promise<void>
  /** The person's name as LINE has it now (`display_name`). */
  setName(id: string, name: string): Promise<void>
  /** The membership an invite gives, upserted on the farm key and the person (a removed row comes back). */
  join(input: JoinInput): Promise<void>
}

export interface JoinInput {
  farmId: string
  farmKey: string
  lineUserId: string
  role: Exclude<Role, 'owner'>
  name: string | null
  pondIds: string[]
  inviteId: string
}

export type InviteStatus = 'pending' | 'claimed' | 'declined' | 'cancelled' | 'expired'

/** A `farm_invites` row. It names the farm by its key, the owner's LINE id. */
export interface InviteRow {
  id: string
  farmKey: string
  /** Six characters, unique across every farm (`farm_invites_code_key`). */
  code: string
  role: Exclude<Role, 'owner'>
  pondIds: string[]
  status: InviteStatus
  expiresAt: string
  createdAt: string
  /** Who issued it (migration 204). */
  createdBy: string | null
}

export interface InviteCreateInput {
  farmKey: string
  createdBy: string
  code: string
  /** Never sent to anyone: the OA's link carries the code. The column is NOT NULL and unique. */
  token: string
  role: Exclude<Role, 'owner'>
  pondIds: string[]
  expiresAt: string
}

export interface InvitesRepo {
  /** The farm's invites still pending, newest first (expired ones included: the route drops them). */
  pendingOf(farmKey: string): Promise<InviteRow[]>
  /** `code_taken` when another invite holds the code. */
  create(input: InviteCreateInput): Promise<InviteRow | 'code_taken'>
  byCode(code: string): Promise<InviteRow | null>
  /** Pending to cancelled; false when the farm has no such pending invite. */
  cancel(farmKey: string, code: string): Promise<boolean>
  /** Pending to claimed by this person, in one write; false when it was not pending any more. */
  claim(id: string, lineUserId: string): Promise<boolean>
  /** Puts a claim back to pending, when the membership could not be written. */
  unclaim(id: string): Promise<void>
}

/** A รับทราบ on a เรื่องน่าจับตา item: it holds while the item's signature is the same. */
export interface StoredAck {
  signature: string
  by: string
  /** HH:MM, Bangkok. */
  at: string
}

/**
 * What the OA keeps per farm in `shrimp_scan_farm_settings.notify` (jsonb).
 * The reminder switches sit at the top level, as migration 211 says; the
 * per-person switches, the farm's รับทราบ and the zone names ride under
 * `perms`, `acks` and `zones` until a migration gives them columns of their own.
 */
export interface FarmSettings {
  notify: NotifySettings
  /** By `farm_members.id`: a person's switches once the owner changed any. */
  perms: Record<string, Permissions>
  acks: Record<string, StoredAck>
  /** By zone letters ('A'): the name the owner gave the zone. A zone without one is โซน A. */
  zones: Record<string, string>
}

export interface SettingsRepo {
  /** The farm's settings, with defaults for whatever was never saved. */
  read(farmId: string): Promise<FarmSettings>
  /** Writes them whole; the target size (`target_per_kg`) is kept. */
  write(farmId: string, settings: FarmSettings): Promise<void>
}

export interface PondsRepo {
  /** The farm's live ponds, by code. */
  ofFarm(farmId: string): Promise<PondRow[]>
  /** New ponds of the farm, owned by the farm key. `name_taken`: a live pond has one of the names (migration 206). */
  create(input: { farmId: string; farmKey: string; codes: string[] }): Promise<PondRow[] | 'name_taken'>
  /** A new name for the pond. `name_taken`: another live pond of the farm has it. */
  rename(pondId: string, code: string): Promise<'ok' | 'name_taken'>
  /** The pond's own ยอ (`net_id`, `net_id_source 'assigned'`). */
  setNet(pondId: string, netId: string): Promise<void>
  /** Every pond of the farm on ยอ `from` moves to ยอ `to` (a ยอ replaced by a corrected one). */
  moveNet(farmId: string, from: string, to: string): Promise<void>
}

export interface NetCreateInput {
  farmId: string
  /** `farm_key`: the farm owner's LINE id. */
  farmKey: string
  cm: number
  createdBy: string
  /** Kept from the ยอ this one replaces, so a replaced farm ยอ stays the oldest. */
  createdAt?: string
}

export interface NetsRepo {
  /** The farm's live ยอ, oldest first (the first is the farm's default). */
  ofFarm(farmId: string): Promise<NetRow[]>
  /** `name_taken`: the farm already has a live ยอ of that size (`farm_nets_one_live_name`). */
  create(input: NetCreateInput): Promise<NetRow | 'name_taken'>
  /**
   * Corrects the size in place. `locked`: a photo was measured with this ยอ
   * (trigger `farm_nets_diameter_locked`), so its size is history.
   */
  setCm(farmId: string, netId: string, cm: number): Promise<'ok' | 'locked' | 'name_taken' | 'not_found'>
  archive(farmId: string, netId: string): Promise<void>
}

export interface ScansRepo {
  /** Saved scans of the farm on or after `sinceDay`, newest first. */
  savedOfFarm(farmId: string, sinceDay: string): Promise<ScanRow[]>
  /** Which pond was scanned on which day, on or after `sinceDay`: two columns, every row (สแกนวันนี้'s grid). */
  scanDays(farmId: string, sinceDay: string): Promise<{ pondId: string; sampleDate: string }[]>
  /** Every saved scan of the pond, newest first. */
  savedOfPond(pondId: string): Promise<ScanRow[]>
  /** Null for an id that is not a scan (or not a uuid). */
  byId(id: string): Promise<ScanRow | null>
  bySha(farmId: string, sha256: string): Promise<ScanRow | null>
  /** A new scan, `status 'queued'`; `duplicate` when the farm has this photo already. */
  create(input: ScanCreateInput): Promise<ScanRow | 'duplicate'>
  linkImage(id: string, imageFileId: string): Promise<void>
  setRim(id: string, ring: number[]): Promise<void>
  update(id: string, patch: ScanPatch): Promise<void>
  /** Takes the pond's other scans saved on `day` out of the pond: one saved scan per pond per day. */
  unsaveDay(pondId: string, day: string, keepId: string): Promise<void>
  /** Undoes an upload that did not finish. */
  remove(id: string): Promise<void>
}

export interface CyclesRepo {
  /** The open cycle of each pond of the farm that has one. */
  openOfFarm(farmId: string): Promise<CycleRow[]>
  openOf(pondId: string): Promise<CycleRow | null>
  /** Writes the open cycle's stocking, opening one (state 'active') when there is none. */
  saveStocking(input: { farmId: string; pondId: string; farmKey: string; stocking: Stocking }): Promise<void>
}

export interface PhotoFileInput {
  farmId: string
  lineUserId: string
  /** The Storage path, `shrimp-scan/<farmId>/<scanId>.<ext>`. */
  ref: string
  mime: string
  bytes: number
  pondId: string
}

export interface PhotosRepo {
  /** Signed URLs (1 hour) by `record_image_files.id`; an id that cannot be signed is left out. */
  urls(imageFileIds: string[]): Promise<Record<string, string>>
  /** Puts the photo in the private bucket; throws when it could not. */
  put(path: string, bytes: Buffer, mime: string): Promise<void>
  /** Best effort: never throws. */
  removeObject(path: string): Promise<void>
  /** The `record_image_files` row (`backend 'supabase'`, `kind 'shrimp_scan'`); its id. */
  addFile(input: PhotoFileInput): Promise<string>
  removeFile(id: string): Promise<void>
  /** The photo's bytes from the bucket, by `record_image_files.id`; null when it is gone. */
  read(imageFileId: string): Promise<{ bytes: Buffer; mime: string } | null>
}

export interface PeopleRepo {
  /**
   * The person already has a footing in น้องน้ำ: a membership on either side
   * (any status) in a farm this OA did not make, a farm they made elsewhere
   * (any status), or a finished น้องน้ำ onboarding. Such a person is never
   * stamped scan_only: that stamp locks the น้องน้ำ LIFF.
   */
  hasNongNamFootprint(lineUserId: string): Promise<boolean>
  /**
   * The person's `line_users` row, made when missing and stamped scan_only,
   * as the farm's owner's is (a membership references it). Throws
   * `ApiError(403, 'not_allowed')` for an erased account.
   */
  stampScanOnly(lineUserId: string, name: string | null): Promise<void>
  /** Keeps the person's LINE picture on their `line_users` row (`picture_url`, migration 190); a missing row is left missing. */
  setPicture(lineUserId: string, pictureUrl: string): Promise<void>
  /** The LINE pictures of these people, by LINE id; anyone without one is left out. */
  pictures(lineUserIds: string[]): Promise<Map<string, string>>
}

export interface QuotaRepo {
  /** Scans the farm can still pay for today; null when it cannot be read. */
  left(farmId: string, limit: number): Promise<number | null>
  /**
   * `sizing_consume_quota`: the scans left after charging this one, -1 when
   * none were left (nothing charged), null when the answer is not a number.
   * A scan whose charge is still open is not charged again. Throws when the
   * call fails.
   */
  consume(scanId: string, limit: number): Promise<number | null>
  /** `sizing_refund_quota`: gives the scan's open charge back; false when it had none. */
  refund(scanId: string): Promise<boolean>
}

export interface GrowthDayInput {
  /** `p_farm_key`: the farm owner's LINE id. */
  farmKey: string
  pondId: string
  day: string
  cycleId: string | null
  ageDays: number | null
  abw: number
  lo: number | null
  hi: number | null
  n: number
  perKg: number
}

export interface GrowthRepo {
  /**
   * `write_photo_growth_sample`, the guarded write น้องน้ำ's own scan uses:
   * the pond-day's one photo row in growth_samples (source 'lift_net_photo'),
   * updated in place; a weighed or typed ABW of that day wins. Its outcome word.
   */
  writePhotoDay(input: GrowthDayInput): Promise<string>
}

export interface Repos {
  farms: FarmsRepo
  members: MembersRepo
  ponds: PondsRepo
  people: PeopleRepo
  quota: QuotaRepo
  nets: NetsRepo
  scans: ScansRepo
  cycles: CyclesRepo
  photos: PhotosRepo
  growth: GrowthRepo
  invites: InvitesRepo
  settings: SettingsRepo
}
