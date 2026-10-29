# Shrimp Scan backend, part 1: farm, ponds, ยอ and the scan · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 501 answers for start, ponds, ยอ and the whole scan (upload, measure, save, fix) with real routes on the shared Supabase database, so an owner can start a farm in the OA and scan a pond end to end on the staging deployment.

**Architecture:** One service-role Supabase client (`src/lib/db.ts`). Thin repositories per table group in `src/data/` behind interfaces, so routes are tested with in-memory repos and the Supabase repos stay small. Pure rules (pond status, permissions, rim geometry) live in `src/domain/` and are ported from the mock store (`liff-app/dev-mock/store.ts`), which stays the reference for every response shape. Routers in `src/routes/liff/` mount before the 501 catch-all; anything part 1 does not build keeps answering 501.

**Tech Stack:** Node 24, Express 4, TypeScript (ESM, NodeNext, `.js` specifiers), `@supabase/supabase-js` 2, vitest + supertest. Measuring: line-bot's sizing service `/v1/rim` and `/v1/measure`.

**Spec:** the published draft https://claude.ai/artifact/SYy2gc5ZUnFqHypWsiPyAb (source `docs/shrimp-scan-rich-menu/src.html` in the umbrella), Bear's answers of 2026-10-29 (below), and the contract `liff-app/src/api/types.ts`.

**Follow-ups, separate plans:** part 2 = today, team, people, invites, permissions, overview + เรื่องน่าจับตา, settings, print. Part 3 = rich menu, `setup:rich-menu`, the วิธีใช้ and อากาศวันนี้ replies.

## Global Constraints

- Database = **PROD** `gydtpgeequcfbrvgubso` for now (Bear 2026-10-29: staging unreachable). Migration 211 is applied there. Nothing in this plan changes the schema.
- **Write guard (Bear):** the server writes ONLY to farms with `created_via = 'shrimp_scan_oa'`. A person whose farm (as owner or member, any status) has another `created_via` gets `403 { error: 'use_nong_nam' }` on every farm route, and nothing is written for them. GET routes never write.
- A farm the OA creates: `created_via 'shrimp_scan_oa'`, `access_level 'scan_only'`, `status 'active'`, `farm_code` = `AW-` + 6 chars of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (retry a farm_code collision up to 3 times), `created_by` = owner LINE id. Its owner's `line_users` row gets `platform_access 'scan_only'` and `signup_source 'shrimp_scan_oa'` (only when the row is created by us or has no signup_source yet).
- ยอ is **round only** (Bear): `NET_CM_MIN 30`, `NET_CM_MAX 200`; a `shape: 'square'` body answers `422 { error: 'net_shape_unsupported' }`. The LIFF hides สี่เหลี่ยม behind one constant.
- Daily scan limit per farm: env `SCAN_DAILY_LIMIT`, default `20` (the web scan's). A farm that scans every pond every day needs at least its pond count (60 for ฟาร์มสายน้ำ), so Bear raises it per environment. Consume with `rpc('sizing_consume_quota', { p_measurement_id, p_limit })` before calling `/v1/measure`, refund with `rpc('sizing_refund_quota', { p_measurement_id })` on any non-`ok` outcome or transport failure. A measure with no quota left answers `402 { error: 'no_credits' }`.
- Identity is `req.lineUserId` from `verifyLiffIdToken` and nothing else. Never log a raw LINE id or token (`src/lib/logger.ts`).
- **A worker sees no number:** `Scan.result` is `null` for a worker (they get `found`); `/ponds`, `/ponds/:id`, `/ponds/:id/scans`, `/stocking` answer `403 not_allowed` to a worker. The four size permissions are held off for a worker whatever is stored.
- Dates are Asia/Bangkok calendar days (`YYYY-MM-DD`); photo coordinates are 0..1 of the photo.
- Photos: Storage bucket `record-images`, path `shrimp-scan/<farmId>/<measurementId>.<ext>`, one `record_image_files` row (`backend 'supabase'`, `ref` = path, `kind 'shrimp_scan'`, `farm_id`, `line_user_id`, `mime`, `bytes`, `pond_ids [pondId]`). Reads go through signed URLs (1 hour).
- Env the server reads (Bear sets them on Railway, never in a file): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SIZING_SERVICE_URL`, `SIZING_SERVICE_SECRET`, `SCAN_DAILY_LIMIT`. With no `SUPABASE_URL`, every part-1 route answers `503 { error: 'db_not_configured' }`; with no sizing config, measure answers `503 { error: 'measure_not_configured' }` and refunds.
- No em dash (U+2014) anywhere. Gate before every commit: `pnpm typecheck && pnpm typecheck:liff && pnpm lint && pnpm test:run && (cd liff-app && pnpm test:run)`.

## Data map (prod columns, checked 2026-10-29)

| Contract | Table and columns |
|---|---|
| Farm, target size | `farms (id, name, farm_code, created_by, created_via, access_level, status)`, `shrimp_scan_farm_settings (farm_id, target_per_kg, notify)`; default target 70 when no row |
| Me in the farm | `farm_members (farm_id, farm_owner_line_user_id, member_line_user_id, role, display_name, scope, pond_ids text[], status 'active')`; the owner has a self row with role `owner` |
| Pond | `ponds (id, farm_id, user_id = farm key, name = code, net_id, net_id_source 'assigned', archived_at null, status)`; zone = the leading letters of `name` (`A01` → `A`), `''` when none |
| Stocking | latest `cycles` row of the pond with `closed_at is null`: `stocking_date`, `stocking_count`, `target_survival_pct / 100` |
| Growth | `growth_samples (pond_id text, sample_date, abw_g, shrimp_per_kg, source 'scan', line_user_id, cycle_id, sample_count, abw_lo_g, abw_hi_g)`, one `scan` row per pond per day |
| ยอ | `farm_nets (id, farm_id, farm_key, name, diameter_cm, archived_at, created_by, created_at)`; `name` = `'ยอ <cm> ซม.'`; the farm default = the oldest live net |
| Scan | `sizing_measurements`: `id, farm_id, line_user_id, pond_id, net_id, ref_diameter_cm, image_file_id, photo_sha256, status, n, abw_g, abw_lo_g, abw_hi_g, shrimp_per_kg, cv, flags, px_lengths, rim_radius_px, rim_ellipse, canvas_px, shrimp_xy, pipeline_version, sam3_calls, sam3_http_attempts, measured_at, sample_date, sample_date_source` |
| Re-measures, notes, fix | `sizing_measurements.flags` entries `remeasure`, `note:<text>`, `fixed:<tag>:<oldPerKg>` (prod lacks 208's `rim_adjustments`) |
| Saved | `sizing_measurements.sample_date is not null` (set to today, `sample_date_source 'farmer'`, on save); at most one saved scan per pond per day: a new save clears the older one's `sample_date` |

## Review Focus

1. A person who already has a น้องน้ำ farm opens the OA: `403 use_nong_nam` on session and start, no `line_users` or `farms` write, no `scan_only` stamp. (Task 2 test.)
2. Double tap on เริ่มใช้: two `POST /start` for the same new person give one farm, and the second answers the same session. (Task 2 test.)
3. The measuring service is down, times out, or answers `retake` / `error`: the quota is refunded, the scan stays `waiting`, the answer is `502 { error: 'measure_failed', reason }` or `422 { error: 'retake', reason }`, never a made-up number. (Task 6 tests.)
4. A worker asks for sizes by any door (`/scans/:id`, measure, `/ponds/:id`): no number leaves the server. (Tasks 3 and 6 tests.)
5. A body that is not an image, or over 12 MB: `415` / `413` before any Storage or database write. (Task 5 test.)

---

### Task 1: Database client, request context and the write guard

**Files:**
- Create: `src/lib/db.ts`, `src/data/types.ts`, `src/data/context.ts`, `src/data/memory.ts`
- Create: `src/data/context.test.ts`
- Modify: `package.json` (add `@supabase/supabase-js@^2`), `.env.example` (the five names, no values)

**Interfaces:**
- Produces: `getDb(): SupabaseClient | null` (null when `SUPABASE_URL` or the key is unset; one client per process).
- Produces in `src/data/types.ts`: row types `FarmRow { id, name, createdBy, createdVia, accessLevel }`, `MemberRow { id, farmId, lineUserId, role: Role, name, pondIds: string[] }`, `PondRow { id, farmId, code, zone, netId: string | null }`, `NetRow { id, farmId, cm: number, createdBy: string | null, createdAt: string, archivedAt: string | null }`, and the repo interface `Repos` with `farms`, `members`, `ponds`, `nets`, `growth`, `cycles`, `scans`, `photos`, `quota` (each later task adds its methods).
- Produces: `class ApiError extends Error { status: number; code: string }` and `resolveContext(repos: Repos, lineUserId: string): Promise<Ctx>` where `Ctx = { lineUserId; farm: FarmRow | null; me: MemberRow | null; blocked: boolean }`. `blocked` is true when the person's farm exists and `createdVia !== 'shrimp_scan_oa'`.
- Produces: `requireFarm(ctx): { farm; me }` throwing `ApiError(403, 'use_nong_nam')` when blocked and `ApiError(409, 'no_farm')` when there is no farm.
- Produces: `createMemoryRepos(seed?)` in `src/data/memory.ts`, the in-memory `Repos` every route test uses.

- [ ] **Step 1: Write the failing tests** in `src/data/context.test.ts`:
  - `resolveContext` with no membership → `{ farm: null, me: null, blocked: false }`.
  - membership in a farm with `createdVia 'onboarding'` → `blocked: true`; `requireFarm` throws `403 use_nong_nam`.
  - membership in an `shrimp_scan_oa` farm → `me.role` as stored; `requireFarm` returns farm and me.
  - a `removed` / `left` membership is ignored (the person reads as farmless).
- [ ] **Step 2: Run** `pnpm vitest run src/data/context.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `db.ts`, `types.ts`, `context.ts`, `memory.ts`. Membership lookup: `farm_members` where `member_line_user_id = id and status = 'active'`, newest `joined_at` first; then the farm by `farm_id`.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): db client, request context and the shrimp_scan_oa write guard`.

### Task 2: Session, start and the target size

**Files:**
- Create: `src/data/supabase/farms.ts`, `src/data/supabase/members.ts`, `src/routes/liff/session.ts`, `src/routes/liff/session.test.ts`
- Modify: `src/app.ts` (mount `liffRouter` from `src/routes/liff/index.ts` after `liffMeRouter`, before the 501 catch-all), `src/routes/liff/index.ts` (create; one place that lists the part-1 routers)

**Interfaces:**
- Consumes: Task 1 `Repos`, `resolveContext`, `requireFarm`, `ApiError`.
- Produces: `GET /session` → `Session`; `POST /start` (`{ name, ponds: string[] }`) → `Session`; `PATCH /farm` (`{ targetPerKg }`) → `Session`. `StartRequest { useFarmId }` answers `403 use_nong_nam` (the guard). `Session.candidate` is always `null` in part 1.
- Produces: repo methods `farms.createOaFarm({ ownerId, ownerName, name, pondCodes }): Promise<FarmRow>` (farm, owner self-membership role `owner`, ponds named by code, `line_users` upsert with the scan_only stamp), `farms.setTarget(farmId, n)`, `farms.target(farmId): Promise<number>`.
- Produces: `sendApiError(res, err)` in `src/routes/liff/errors.ts`: `ApiError` → its status and `{ error: code }`, anything else → `500 { error: 'internal_error' }` with a logged message.

- [ ] **Step 1: Write the failing tests** (supertest on `createApp` with memory repos injected through `AppOptions.repos`; auth with the dev token the existing `liff-auth.test.ts` uses):
  - new person: `GET /api/liff/session` → `farm: null, role: null, candidate: null, pondIds: []`, and the memory repos hold no new rows.
  - `POST /start { name: 'ฟาร์มทดสอบ', ponds: ['A01','A02','B01'] }` → `role 'owner'`, `farm.pondCount 3`, `farm.zoneCount 2`, `farm.targetPerKg 70`; the farm row has `createdVia 'shrimp_scan_oa'`, `accessLevel 'scan_only'`.
  - the same `POST /start` twice → one farm; the second answers the same `farm.id`.
  - a person in an `onboarding` farm: `GET /session` and `POST /start` → `403 { error: 'use_nong_nam' }`, no write.
  - `POST /start` with 0 ponds, a blank name, or a duplicate pond code → `400 { error: 'bad_request' }`.
  - `PATCH /farm { targetPerKg: 60 }` by the owner → `farm.targetPerKg 60`; by a worker → `403 not_allowed`; `0` or non-integer → `400`.
  - no `SUPABASE_URL` and no injected repos → `503 { error: 'db_not_configured' }`.
- [ ] **Step 2: Run** `pnpm vitest run src/routes/liff/session.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `Session.permissions` and the worker hold-off come from `src/domain/permissions.ts` (create it: `DEFAULTS` and `effective()` ported from the mock store, lines 221 to 236); `creditsLeft` = `rpc('sizing_quota_status', { p_farm_id, p_limit })`.remaining, or `SCAN_DAILY_LIMIT` when the call fails; `today` = Bangkok date. Supabase `createOaFarm` mirrors line-bot `src/lib/farms/create-farm.ts` (insert farm with the farm_code retry, upsert the self-membership on `farm_owner_line_user_id,member_line_user_id`, delete the farm if the membership fails), then inserts the ponds with `user_id` = owner, `farm_id`, `status 'active'`.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): session, start and target size on the shared database`.

### Task 3: Ponds, pond detail, history and stocking

**Files:**
- Create: `src/domain/tiles.ts`, `src/domain/tiles.test.ts`, `src/data/supabase/ponds.ts`, `src/routes/liff/ponds.ts`, `src/routes/liff/ponds.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `tileOf(input: { pond: PondRow; samples: { date: string; abw: number }[]; stockedOn: string | null; savedToday: boolean; caretaker: string | null; mine: boolean; targetPerKg: number; today: string }): PondTile`. Status rules ported from the mock store `tile()` and `issueOf()` (store.ts 242 to 249, 602 to 633): `missing` when not saved today, then from `gPerDay` and `daysToTarget`. `gPerDay` = least-squares slope of the last 4 samples (null under 2); `reachOn` = today + ceil((1000/targetPerKg − abw) / gPerDay) days when gPerDay > 0.
- Produces routes: `GET /ponds` → `PondsResponse`, `GET /ponds/:id` → `PondDetail`, `GET /ponds/:id/scans` → `PondScansResponse`, `GET|PUT /ponds/:id/stocking` → `Stocking`, `PUT /ponds/:id/net` (`{ netId }`) → 204. A pond of another farm → `404 not_found`.

- [ ] **Step 1: Write the failing tests:**
  - `tiles.test.ts`: no samples and not saved today → `status 'missing'`, `abw null`; samples 10.0 g, 10.8 g, 11.6 g a day apart, target 70 → `gPerDay 0.8`, `perKg` = round(1000/11.6) = 86, `reachOn` = today + ceil((14.29 − 11.6)/0.8) = today + 4 → `status 'ready'`; a pond growing 0.15 g/day → `status 'urgent'` and `issue` = `'โตช้ามาก วันละ 0.15 ก.'` (the mock's wording).
  - `ponds.test.ts`: owner `GET /ponds` → one tile per live pond in code order, zones summed; a worker → `403 not_allowed` on `/ponds`, `/ponds/:id`, `/ponds/:id/scans`, `/ponds/:id/stocking`; `PUT /stocking { stockedOn: '2026-10-01', count: 200000, survival: 0.8 }` then `GET` → the same values; `PUT /ponds/:id/net` with a net of another farm → `404`.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Stocking writes the pond's open cycle (insert one with `farm_id`, `pond_id`, `line_user_id` = owner, `state 'active'` when none is open). `tonnesNow` = count × survival × abw / 1e6, null when any is unknown. `PondDetail.latestShrimpGrams` comes from Task 6's stored result; return `[]` until then.
- [ ] **Step 4: Run** both test files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): ponds, pond detail and stocking`.

### Task 4: ยอ (nets), round only

**Files:**
- Create: `src/data/supabase/nets.ts`, `src/routes/liff/nets.ts`, `src/routes/liff/nets.test.ts`
- Modify: `liff-app/src/lib/rim.ts` or the ยอ step screens: one exported `SQUARE_NET_ENABLED = false` that hides the สี่เหลี่ยม card wherever the shape is chosen; `liff-app/dev-mock/store.test.ts` keeps passing.

**Interfaces:**
- Produces routes: `GET /nets` → `NetsResponse`, `POST /nets` (`NetCreate`) → `Net`, `PATCH /nets/:id` (`NetEdit`) → `Net`. `Net.use` / `pondCount` from ponds whose `net_id` is this net (`'ยอของฟาร์ม'` for the default). The first net of a farm is its default.
- Produces: `netOf(farmId, pondId): Promise<NetRow | null>` = the pond's `net_id`, else the farm default (Task 5 and 6 use it).

- [ ] **Step 1: Write the failing tests:** add `{ shape: 'round', cm: 82 }` → `cm 82, isFarmDefault true`; add `{ shape: 'round', cm: 60, pondId }` → that pond's `net_id` is the new net; `cm 29` or `201` → `422 { error: 'net_out_of_range' }`; `shape 'square'` → `422 { error: 'net_shape_unsupported' }`; a worker adding a net → `403`.
- [ ] **Step 2: Run** `pnpm vitest run src/routes/liff/nets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then hide the square card in the LIFF and run `cd liff-app && pnpm test:run && pnpm typecheck`.
- [ ] **Step 4: Run** the server test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): ยอ routes, round only; LIFF hides the square ยอ`.

### Task 5: Photo upload, the rim guess and the scan view

**Files:**
- Create: `src/lib/sizing.ts`, `src/lib/sizing.test.ts`, `src/domain/rim-geometry.ts`, `src/domain/rim-geometry.test.ts`, `src/data/supabase/scans.ts`, `src/data/supabase/photos.ts`, `src/routes/liff/scans.ts`, `src/routes/liff/scans.test.ts`

**Interfaces:**
- Produces in `src/lib/sizing.ts` (trimmed port of line-bot `src/lib/services/sizing/client.ts`: env read at call time, AbortController, never throws, **no retry**): `detectRim(image: Buffer, type): Promise<SizingResult<{ found: boolean; ring: SizingRing | null; confidence: number }>>` (30 s) and `measure(image, type, { diameterCm, rimEllipse, runId }): Promise<SizingResult<SizingMeasureResponse>>` (55 s), sending `rim_source 'farmer'`. Copy the `SizingResult<T>` union (`{ ok: true; data: T } | { ok: false; code: 'NOT_CONFIGURED' | 'TIMEOUT' | 'HTTP_ERROR' | 'BAD_BODY' | 'NETWORK' }`, as line-bot's client returns it) and the `SizingMeasureResponse`, `SizingRing`, `SizingTrayEllipse` types from line-bot `src/lib/services/sizing/`.
- Produces in `src/domain/rim-geometry.ts`, with `W`, `H` the photo's pixel size:
  - `pointsToEllipse(rim: Pt[], W, H): SizingTrayEllipse`: fit with the LIFF's `fitRing` (copy `solve4`, `fitEllipse`, `fitRing` from `liff-app/src/lib/rim.ts`), convert to pixels, then `cx = cxPx/W, cy = cyPx/H, a = aPx/W, b = bPx/W`, `theta` in radians, `a >= b`.
  - `ellipseToPoints(e: SizingTrayEllipse, W, H): Pt[]` and `ringToPoints(ring: SizingRing, W, H) = ellipseToPoints(tuple as ellipse)`: the 4 points at theta 0, 90, 180, 270 degrees, in the top, right, bottom, left order the LIFF uses (`RIM_SIDES`).
  - `canvasToPhoto(p: Pt, e: SizingTrayEllipse, rimRadiusPx, canvasPx, W, H): Pt`: inverse of the flatten affine documented in line-bot `types.ts` (`A = rotᵀ · diag(s, s·aPx/bPx) · rot`, `s = rimRadiusPx / aPx`, `translate = [oc, oc] − A · [cxPx, cyPx]`, `oc = canvasPx/2`); photo px = A⁻¹ · (canvas px − translate), then divide by W, H.
- Produces route `POST /scans?pondId=` (raw body, `image/jpeg|png|webp`, at most 12 MB) → `ScanCreateResponse`, and `GET /scans/:id` → `Scan`. Upload order: validate, sha256, insert `sizing_measurements` (`status 'queued'`), put the object, insert `record_image_files`, link `image_file_id`, then `detectRim` (a miss falls back to the LIFF's `centredGuess('round')` points). Photo size from the image header (port `imageSize()` from the mock store).

- [ ] **Step 1: Write the failing tests:**
  - `rim-geometry.test.ts`: points on a circle of radius 0.4 W centred on a 1000 × 800 photo → `a ≈ b ≈ 0.4` (fractions of W), `cy = 0.5`; `ringToPoints(pointsToEllipse(p))` returns the same 4 points within 1e-6; a canvas point at the canvas centre maps back to the ellipse centre; the canvas point `(oc + rimRadiusPx, oc)` maps onto the rim.
  - `sizing.test.ts` (fetch mocked): unset `SIZING_SERVICE_URL` → `{ ok: false, code: 'NOT_CONFIGURED' }` with no fetch; a 500 → `{ ok: false }` and exactly one fetch; the form carries `diameter_cm`, `rim_ellipse` JSON and `rim_source 'farmer'`.
  - `scans.test.ts`: a `text/plain` body → `415`, 13 MB → `413`, both with no repo write; an upload to a pond of another farm → `404`; a good JPEG (`liff-app/dev-mock/fixtures/yor.jpg`) with `detectRim` stubbed → `scan.status 'waiting'`, `rimGuess` 4 points, `width 520, height 461`, `photoUrl` a signed URL, `result null`; a worker uploading to a pond that is not theirs → `403 not_allowed`.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three test files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): photo upload, rim guess and scan view`.

### Task 6: Measure, change ยอ and save

**Files:**
- Modify: `src/routes/liff/scans.ts`, `src/data/supabase/scans.ts`, `src/routes/liff/scans.test.ts`
- Create: `src/domain/scan-view.ts`, `src/domain/scan-view.test.ts`

**Interfaces:**
- Consumes: Task 5 `measure`, `pointsToEllipse`, `canvasToPhoto`; Task 4 `netOf`.
- Produces: `POST /scans/:id/measure` (`MeasureRequest`) → `MeasureResponse`, `POST /scans/:id/net` (`{ netId }`) → `MeasureResponse` (re-measures the same photo and rim on the new ยอ), `POST /scans/:id/save` (`SaveRequest`) → `SaveResponse`.
- Produces: `toScanResult(row, net, W, H, previous): ScanResult` in `scan-view.ts`, built from the stored row so a later read gives the same answer as the measure: `abw = abw_g`, `perKg = shrimp_per_kg`, `count = n`, `cv = cv`, `shrimp[i]` = `shrimp_xy` pair i mapped with `canvasToPhoto`, `g` from `shrimp_len_px[i]` (cm = px × ref_diameter_cm / (2 × rim_radius_px), grams by the length-weight conversion ported from line-bot `src/scan/shrimp-size.ts`), `lengthCm` = the mean of those cm to 1 decimal, `rim` = `ellipseToPoints` of the stored `rim_ellipse`, `remeasuresLeft = 3 − (count of 'remeasure' in flags)` (line-bot `RIM_ADJUSTMENTS_MAX = 3`; prod has no `rim_adjustments` column, 208 is not there).
- **Blocked on one prod column:** `shrimp_len_px` is line-bot's migration 210 (one additive `real[]` column), not on prod. Task 6 starts only after Bear says yes to applying 210 to prod. Without it a stored scan has dots but no grams.
- Produces: `scanFor(me, row): Scan` that sets `result: null` and `found` (dots only) for a worker.

- [ ] **Step 1: Write the failing tests** (sizing stubbed):
  - `ok` → row `status 'ok'`, sizes stored, `rim_ellipse`, `shrimp_xy`, `canvas_px`, `measured_at` set; the owner gets `result` with `count` = the stub's `n`; `creditsLeft` dropped by 1.
  - the same measure as a worker → `result null`, `found` has `n` points.
  - `retake` (`no_rim`) → `422 { error: 'retake', reason: 'no_rim' }`, quota refunded, row `status 'retake'`.
  - transport timeout → `502 { error: 'measure_failed' }`, quota refunded, the scan reads `waiting` again.
  - quota exhausted (`sizing_consume_quota` returns −1 or null, as line-bot `line-surface.ts` reads it) → `402 { error: 'no_credits' }` and no sizing call.
  - a 4th re-measure on one photo → `409 { error: 'remeasure_limit' }`.
  - save as owner → `SaveResponse.reachOn` set, one `growth_samples` row (`source 'scan'`, today, `abw_g`, `shrimp_per_kg`, `sample_count n`); a second save of the same pond today → still one row, holding the newer scan; save as a worker → `reachOn null`, notes stored on the row's `flags` as `note:<text>`.
- [ ] **Step 2: Run** `pnpm vitest run src/routes/liff/scans.test.ts src/domain/scan-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Measure order: check the remeasure count, consume quota, set `status 'measuring'`, call `measure`, store the outcome, refund on anything but `ok`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): measure, change ยอ and save a scan into the pond`.

### Task 7: Fix the rim

**Files:**
- Modify: `src/routes/liff/scans.ts`, `src/routes/liff/scans.test.ts`

**Interfaces:**
- Produces: `POST /scans/:id/fix` (`FixRequest`) → `FixResponse` (measures the new rim without storing it; costs a re-measure, not quota), `POST /scans/:id/fix/apply` (`FixApplyRequest`) → 204 (`use 'new'` stores the new result and records who fixed it and the old perKg in `flags` as `fixed:<lineUserTag>:<oldPerKg>`; `use 'old'` changes nothing).
- [ ] **Step 1: Write the failing tests:** fix by the scan's own measurer → `before` and `after` differ as the stubs say; by someone without `editOthers` → `403`; by a worker → `403`; apply `new` then `GET /ponds/:id/scans` → that summary has `fixed.oldPerKg`.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): fix the rim of a measured scan`.

### Task 8: Prod smoke check and the docs

**Files:**
- Create: `scripts/db-smoke.ts` (`pnpm db:smoke`)
- Modify: `package.json`, `CLAUDE.md` (replace "Later: the database" with what is live, the prod-for-now note and the guard), `README.md` "Next", `docs/SETUP.md` (the five Railway variables, names only)

- [ ] **Step 1:** `db-smoke.ts` reads only: counts `farms` by `created_via`, checks `shrimp_scan_farm_settings` exists, calls `sizing_quota_status` for a random uuid. It prints no ids and refuses to run when `SUPABASE_URL` is unset.
- [ ] **Step 2: Run** the full gate. Expected: all green.
- [ ] **Step 3: Commit** `docs: backend part 1 is live on the shared database`.
- [ ] **Step 4:** Ask Bear before any push. A push to `launch-prep` deploys staging, which then writes to PROD.
