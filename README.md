# shrimpscan-line-bot

LINE bot and LIFF app for **Shrimp Scan** (สแกนกุ้ง), its own LINE Official
Account next to น้องน้ำ. Working name `AquaWise สแกนกุ้ง`; the owner picks the
product name. Built the way `line-bot/` is built. See `CLAUDE.md` for the
branch and environment model and the rules.

## Run it

```
pnpm install
pnpm liff:install

pnpm liff:mock     # the whole LIFF, no server, no LINE: http://localhost:5199/liff/
pnpm dev           # the server on :3000 (boots with no LINE secrets)
pnpm liff:dev      # the LIFF against that server (dev bypass: see .env.example)
```

Mock personas: add `?as=owner` (พี่วิชัย, ฟาร์มสายน้ำ, 60 ponds),
`?as=worker` (ช่างเอก, F01 to F10), `?as=new` (has a farm in น้องน้ำ) or
`?as=fresh` (no farm yet) to any URL. Good places to start:

| URL | Screen |
|---|---|
| `/liff/app?as=owner` | ภาพรวมฟาร์ม (O21) |
| `/liff/app/ponds/p-a04` | หน้าบ่อ A04 (O23) |
| `/liff/app/scan?pond=p-f10` | สแกน F10 (O19); pick `liff-app/dev-mock/fixtures/yor.jpg` |
| `/liff/app/inbox` | รูปรอสแกน (O13) |
| `/liff/app/print` | ใบสรุป A4 (O32 to O34) |
| `/liff/app?as=worker` | บ่อที่ดูแลวันนี้ (W23) |
| `/liff/app/join?invite=7K2P9QX&as=new` | คำเชิญ (W2) |

Screenshots of every screen: `pnpm mock` in one terminal, then
`cd liff-app && pnpm shots` (PNGs in `liff-app/tests/visual/out/`).

## Checks

```
pnpm typecheck && pnpm typecheck:liff && pnpm lint
pnpm test:run && (cd liff-app && pnpm test:run)
pnpm build
docker build -t shrimpscan-line-bot . && docker run -p 8080:8080 shrimpscan-line-bot
```

## What exists

- Server: `/health`, the signed `/webhook` (follow → greeting, text → a
  placeholder with a button that opens the LIFF), `/api/liff-config`, `/liff`,
  and `GET /api/liff/me` behind LIFF auth. Every other `/api/liff/*` route
  answers 501 `not_built_yet`.
- LIFF: every screen of the mock flow (owner, worker, onboarding, invites,
  permissions, ยอ sizes, rim fix, inbox, print sheets), against the contract in
  `liff-app/src/api/types.ts`, running on the mock API.
- CI: `.github/workflows/ci.yml` on GitHub
  (`Bearior/aquawise-shrimpscan-linebot`). Every push and PR to `launch-prep`
  (staging) or `main` (prod) typechecks, lints, tests, builds and builds the
  Docker image. Nothing deploys yet.
- Deploy, prepared but not used: `Dockerfile`, `cloudbuild.yaml`,
  `cloudbuild.pr.yaml`, `.github/workflows/notify-ecosystem.yml` (skips while
  `ECOSYSTEM_BOT_PAT` is unset), and the owner's console steps in
  `docs/SETUP.md`.

## Next

1. Server routes for the LIFF contract (`liff-app/src/api/types.ts`): sessions,
   farms, ponds, scans, nets, members, invites, settings. Supabase tables shared
   with น้องน้ำ; decide what is new and what is reused.
2. The measuring call: whether this bot calls the existing scan service or
   ports its code. Nothing from line-bot's `src/scan/` is copied yet.
3. Photo storage and upload limits for `POST /api/liff/scans`.
4. Print: a server-made PDF, opened with `liff.openWindow({ external: true })`
   (the LIFF prints with `window.print()` today), and "ส่งเป็นรูป" into the chat.
5. Chat: photos sent in the 1:1 chat land in the owner's inbox; the worker's
   save line (`สแกน F10 แล้ว`) gets น้ำ's reply; Flex cards; rich menus for
   owner and worker.
6. Reminders and the morning summary (the notify settings on O25).
7. One word for the worker: the mock says ลูกน้อง, น้องน้ำ's glossary says
   คนงาน, and both apps share one members table. `WORKER` in
   `liff-app/src/copy/th.ts`.
8. The product name, then the LINE OAs, then `docs/SETUP.md`.
9. Not in scope yet: PostHog, Sentry, an admin app, i18n beyond the Burmese
   chat-language choice on W2.
