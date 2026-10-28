# Claude Code guidance · shrimpscan-line-bot

The LINE bot and LIFF app for **Shrimp Scan** (สแกนกุ้ง), a LINE Official
Account separate from น้องน้ำ. Farm owners see sizes, growth and the harvest
queue; workers scan or send ยอ photos. `AquaWise สแกนกุ้ง` and the slug
`shrimpscan-line-bot` are working names until the owner picks the product name.

It is built the way `line-bot/` is built: same branches, same deploy shape,
same LIFF auth. It is NOT yet a submodule of the umbrella. Its remote is
`github.com/Bearior/aquawise-shrimpscan-linebot`. Nothing is deployed: a push
runs CI and nothing else.

## Branches and environments

| Branch | Environment | Cloud Build trigger | Cloud Run service | LINE channels |
|---|---|---|---|---|
| `main` | prod | `shrimpscan-line-bot-prod` (push) | `aquawise-shrimpscan-line-bot` | prod OA (Messaging API) + prod LINE Login channel with the prod LIFF |
| `launch-prep` | staging | `shrimpscan-line-bot-staging` (push, `_NODE_ENV=staging`) | `aquawise-shrimpscan-line-bot-staging` | staging OA + staging LINE Login channel with the staging LIFF |
| PR into either | none | `shrimpscan-line-bot-pr-gate` (tests only) | none | none |

- Feature branches start from `launch-prep` and merge back into it. Prod moves
  only by a PR from `launch-prep` into `main`.
- **A push to `launch-prep` IS a staging deploy** (about 10 minutes). **A push
  to `main` IS a prod deploy.** A push is never "just saving". (Once a deploy
  exists. Today the Cloud Build triggers do not, and a push only runs CI.)
- **CI is GitHub Actions** (`.github/workflows/ci.yml`): every push and PR to
  `launch-prep` or `main` installs, typechecks, lints, tests, runs `pnpm
  build`, and builds the Docker image. A deploy job added later must
  `needs: gate`, so a red gate never deploys.
- Each environment has TWO LINE channels: the Messaging API channel (the OA:
  webhook, secret, access token) and a LINE Login channel that holds the LIFF
  app (a LIFF cannot live on a Messaging API channel). Staging holds only
  staging values, prod only prod. Never cross them: line-bot once ran staging
  with the prod LINE token (2026-05-31). Scripts that use a token require
  `LINE_CHANNEL_TARGET` (`src/lib/line/safety.ts`).
- One bundle serves both environments. `VITE_LIFF_ID` is baked empty; the LIFF
  reads its id from `/api/liff-config` at runtime.

## Which build is live

`GET <service>/api/liff-config` answers `{ liffId, build_id, env }`. `build_id`
is the UTC build time (`YYYYMMDDHHMMSS`) the Docker builder wrote. Compare it
with the commit time before blaming code: a push to `launch-prep` is not live
until a build newer than the commit is. `/health` carries the same id.

## Deploy rules

- `cloudbuild.yaml` deploys with `--update-env-vars NODE_ENV=...` only. **Never
  `--set-env-vars`**: it replaces every env var on the service and wipes
  `LIFF_ID`, `LIFF_CHANNEL_ID` and anything else set by hand.
- `_SERVICE` defaults to **staging**; `_NODE_ENV` defaults to **production**.
  Opposite defaults on purpose: a mis-wired service lands on staging (harmless);
  a mis-wired NODE_ENV must leave staging dark, never switch staging-only
  features on for farmers.
- A future staging-only **build** flag (`VITE_*`) is derived from `_NODE_ENV`
  in the build step, and its safe direction is off. A feature that is on in
  staging but off in prod after a promotion is usually a build-time flag, so
  read the live bundle before calling it a code bug.
- The deploy refuses to run without `_RUNTIME_SA`.
- The service boots without LINE secrets: `/webhook` answers 503
  `line_not_configured`, `/api/liff/*` answers 503 `liff_not_configured`.
- `docs/SETUP.md` is the owner's console checklist (LINE, GitHub, GCP).

## Auth

The LIFF sends `Authorization: Bearer <liff.getIDToken()>` (access token as the
fallback). `src/middleware/liff-auth.ts` verifies it with LINE (ID token
against `LIFF_CHANNEL_ID`, else the access token's `client_id` against the
allow-list, then `/v2/profile`), caches 5 minutes by sha256 of the token, and
sets `req.lineUserId`. **Identity is `req.lineUserId` and nothing else.** A
request body never carries a user id. Never log a raw token or a raw LINE user
id (`src/lib/logger.ts` redacts; bare `console.*` is a lint error).

Local dev bypass: `ALLOW_DEV_LIFF_AUTH=true` + `LIFF_DEV_USER_ID` on the
server, `VITE_DEV_LIFF_TOKEN=dev-liff` on the LIFF. The server refuses to boot
with either variable when `K_SERVICE` is set (Cloud Run), and the LIFF compiles
the bypass out of builds.

## The LIFF app (`liff-app/`)

- Screens follow `docs/shrimp-scan-flow-mock` in the umbrella (round 3). Its
  `HANDOFF.md` names every screen (O1 to O38, W1 to W23, E1 to E6); the screen
  files say which ids they implement.
- **The scan itself follows แบบ 2** of the ขอบยอ canvas
  (`docs/shrimp-scan-rim-redesign/M2.dc.html` in the umbrella), steps and
  motion both: pond, ยอ (shape cards, then a saved size or one typed once),
  photo, rim (4 points on a ยอกลม, 4 corners on a ยอสี่เหลี่ยม), then
  measuring and the result on the same last step. The owner sees the ยอ step
  every time (5 steps, this pond's ยอ already chosen); a worker has no ยอ
  step (4 steps, the ยอ as a chip on the photo step). The inbox measure flow
  has ยอ, rim, result per photo. `src/lib/rim.ts` holds the geometry for both
  shapes (`fitRim`).
- **Motion is Day's MO1** (line-bot branch `day-design-guidelines`,
  `docs/design/liff-design-guidelines/`): press 120, select 160, fade 180,
  step 240 (new content slides 24 px in from the side it comes from), bar
  240, height 300, plus แบบ 2's ring draw-on 420, point pop 260, shutter
  flash and the measuring sweep. Tokens in `src/lib/motion.ts`, the rest in
  `src/styles/motion.css`. Never a running number, a shake, a sound, or a
  move that makes the person wait; nothing rests on a transform; reduced
  motion cuts every move.
- `src/api/types.ts` is **the contract** for every `/api/liff/*` call, and
  `src/api/client.ts` is the only place a path is spelled. The server routes
  for it are not built: every `/api/liff/*` route except `/me` answers 501
  `not_built_yet` (after auth).
- **`pnpm mock`** (or `pnpm liff:mock` from the root) runs the whole app with
  no backend on http://localhost:5199/liff/. `dev-mock/mock-api.ts` is a Vite
  plugin; `dev-mock/store.ts` is an in-memory ฟาร์มสายน้ำ (60 ponds, the
  canvas's numbers) typed against `types.ts`, so a contract change breaks it at
  `tsc` time. `?as=owner|worker|new|fresh` picks the persona;
  `POST /api/mock/reset` starts over. Upload `dev-mock/fixtures/yor.jpg` to get
  the canvas's rim guess and dots (F10 reads 13.9 g on the guess, 17.2 g on the
  floor edge). Into a pond whose ยอ is square, upload
  `dev-mock/fixtures/yor-square.jpg` (an illustration) for แบบ 2's corners
  and its 54 shrimp.
- `pnpm shots` (with `pnpm mock` running) screenshots every screen at 390 px
  into `tests/visual/out/`; `TALL=1` for the whole scroll.
- `/liff/app/*` waits for `useLiff().isReady` before any screen mounts
  (`router.tsx` LiffGate), so no screen can fetch before the ID token exists.
- All shared Thai copy: `liff-app/src/copy/th.ts`; the server's:
  `src/copy/th.ts`. The worker's role word is one constant (`WORKER`).
- Visual source: `design-system-v1/` in the umbrella, through the mock's own
  styles ported in `src/styles/mock-port.css`.

## Commands

```
pnpm install && pnpm liff:install
pnpm dev                    # server on :3000 (tsx watch)
pnpm liff:dev               # LIFF on Vite, /api proxied to :3000
pnpm liff:mock              # LIFF with the mock API, no server
pnpm typecheck && pnpm typecheck:liff && pnpm lint
pnpm test:run && (cd liff-app && pnpm test:run)
pnpm build                  # LIFF into public/liff, then the server into dist
```

The gate is exactly those typecheck, lint and test commands, in
`.github/workflows/ci.yml` (which then builds, and builds the Docker image),
`cloudbuild.yaml` step 1 and `cloudbuild.pr.yaml`. Keep all three in step.

Windows: run `pnpm mock` from Git Bash or PowerShell as is (no inline env
syntax in the scripts). Git Bash mangles `origin/x:path` arguments; set
`MSYS_NO_PATHCONV=1`.

## Later: the database

Same Supabase as น้องน้ำ, not used yet: staging `jysoyhdvnqgnvrlfsisk`, prod
`gydtpgeequcfbrvgubso`. Check a migration is applied to an environment before
turning on anything that needs it.

## Product context

Read the umbrella's `aquawise-docs/` (start with `01-aquawise-stakeholder-map.md`
and `03-aquawise-farmer-customer-doc.md`) and the design in
`docs/shrimp-scan-line-oa/` before product work. The docs decide what to
build; this file decides how.

## Rules

- **No em dash (U+2014) anywhere**: copy, docs, comments, commit messages. Use
  two sentences, or " · ". `git grep -n "$(printf '\342\200\224')"` must print
  nothing before a commit.
- Never print a secret: not in chat, files, logs, commits or command arguments.
- Outward-facing steps (push, GitHub, GCP, LINE consoles) need the owner's go.
