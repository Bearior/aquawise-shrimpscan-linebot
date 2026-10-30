# Setup checklist (for the owner)

Everything outside this repo that has to exist before Shrimp Scan runs on LINE.
Do **staging first**, check it (D), then prod with the same steps.

The names below use the working slug `shrimpscan-line-bot`. If the owner picks
another name, choose the slug first (lowercase, at most 19 characters so
`sa-<slug>-runtime` fits GCP's 30-character limit; not `shrimp-scan`, not
`line-bot`) and replace it everywhere here, in `cloudbuild.yaml` (`_SERVICE`)
and in `CLAUDE.md`.

| Thing | Staging | Prod |
|---|---|---|
| Branch | `launch-prep` | `main` |
| Cloud Run service | `aquawise-shrimpscan-line-bot-staging` | `aquawise-shrimpscan-line-bot` |
| Expected URL (confirm after the first deploy) | `https://aquawise-shrimpscan-line-bot-staging-831904296386.asia-southeast1.run.app` | `https://aquawise-shrimpscan-line-bot-831904296386.asia-southeast1.run.app` |
| Cloud Build trigger | `shrimpscan-line-bot-staging` | `shrimpscan-line-bot-prod` |
| Secrets | `shrimpscan-line-bot-line-channel-secret-staging`, `shrimpscan-line-bot-line-channel-access-token-staging` | the same two ending in `-prod` |
| LINE OA | `<APP_NAME> staging` | `<APP_NAME>` |
| LINE Login channel | `<APP_NAME> LIFF staging` | `<APP_NAME> LIFF` |

PR gate trigger: `shrimpscan-line-bot-pr-gate`. Runtime service account (both
environments): `sa-shrimpscan-line-bot-runtime@aquawise-deployment.iam.gserviceaccount.com`.
GCP project `aquawise-deployment` (`831904296386`), region `asia-southeast1`.

## A. LINE (per environment)

1. **LINE Official Account Manager**: create the OA (`<APP_NAME> staging`, or
   `<APP_NAME>`). Turn on Messaging API and choose the provider **AquaWise**,
   the one น้องน้ำ uses. **This is permanent.** A LINE user id is per provider,
   so this is the only way one person has the same id in both bots and in the
   shared database.
2. **LINE Developers Console**, that Messaging API channel:
   - copy the **channel secret**;
   - issue a **long-lived channel access token**;
   - webhook URL `<service URL>/webhook`, and turn on **Use webhook**.
   In the OA Manager response settings: **auto-reply off, greeting message
   off** (the bot sends its own).
3. **Create a LINE Login channel** under the same provider (a LIFF app cannot
   be added to a Messaging API channel). Set its **linked LINE Official
   Account** to this environment's OA. Add a LIFF app:
   - size **Full**;
   - endpoint `<service URL>/liff/`;
   - scopes `openid` and `profile`;
   - add friend option **on**.
   Copy the **LIFF ID** and the **Login channel ID**. A Login channel in
   "Developing" lets only people with a role on it log in: add the testers, or
   publish it.
4. If the console no longer matches these steps, follow LINE's current docs and
   write down what changed here.

## B. GitHub

1. Done 2026-10-28: the repo is `Bearior/aquawise-shrimpscan-linebot`, with
   `main` and `launch-prep` pushed and CI (`.github/workflows/ci.yml`) on both.
   If it moves to `aquawise-tech`, change the remote and the names below.
2. Add the repository secret `ECOSYSTEM_BOT_PAT` (the same PAT line-bot uses).
   If it is a fine-grained PAT, add this repo to it, or the umbrella's bump job
   cannot check the submodule out.
3. Give the Cloud Build GitHub connection that line-bot's triggers use access
   to this repo.

## C. GCP

```bash
P=aquawise-deployment
R=asia-southeast1
SA=sa-shrimpscan-line-bot-runtime
SA_EMAIL=$SA@$P.iam.gserviceaccount.com
BUILDER=gha-linebot@$P.iam.gserviceaccount.com
```

1. Runtime service account, with **no project roles**:
   ```bash
   gcloud iam service-accounts create $SA --project $P --display-name "Shrimp Scan LINE bot runtime"
   gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL --project $P \
     --member serviceAccount:$BUILDER --role roles/iam.serviceAccountUser
   ```
2. The 4 LINE secrets, typed in (never on the command line), each readable by
   the runtime account only. Repeat for `-prod`:
   ```bash
   for name in shrimpscan-line-bot-line-channel-secret-staging shrimpscan-line-bot-line-channel-access-token-staging; do
     echo "Paste $name, then Enter:"; read -rs X
     printf %s "$X" | gcloud secrets create $name --project $P --replication-policy automatic --data-file=-
     unset X
     gcloud secrets add-iam-policy-binding $name --project $P \
       --member serviceAccount:$SA_EMAIL --role roles/secretmanager.secretAccessor
   done
   ```
3. Triggers in `asia-southeast1`, all running as `gha-linebot@`. Create them in
   the console (Cloud Build → Triggers, region asia-southeast1, the GitHub
   connection from B.3):
   - `shrimpscan-line-bot-pr-gate`: pull request, base branch
     `^(main|launch-prep)$`, config `cloudbuild.pr.yaml`.
   - `shrimpscan-line-bot-staging`: push to `^launch-prep$`, config
     `cloudbuild.yaml`, substitutions `_SERVICE=aquawise-shrimpscan-line-bot-staging`,
     `_NODE_ENV=staging`, `_TAG=$COMMIT_SHA`, `_RUNTIME_SA=<SA_EMAIL>`.
   - `shrimpscan-line-bot-prod`: push to `^main$`, config `cloudbuild.yaml`,
     `_SERVICE=aquawise-shrimpscan-line-bot`, `_TAG=$COMMIT_SHA`,
     `_RUNTIME_SA=<SA_EMAIL>`. **Leave `_NODE_ENV` unset** (it defaults to
     production).
   From then on **every push to `launch-prep` or `main` deploys.**
4. After the first deploy of each service (staging shown):
   ```bash
   S=aquawise-shrimpscan-line-bot-staging
   gcloud run services update $S --project $P --region $R \
     --update-secrets LINE_CHANNEL_SECRET=shrimpscan-line-bot-line-channel-secret-staging:latest,LINE_CHANNEL_ACCESS_TOKEN=shrimpscan-line-bot-line-channel-access-token-staging:latest \
     --update-env-vars LIFF_ID=<staging LIFF ID>,LIFF_CHANNEL_ID=<staging Login channel ID>
   gcloud run services add-iam-policy-binding $S --project $P --region $R \
     --member allUsers --role roles/run.invoker
   gcloud run services describe $S --project $P --region $R --format='value(status.url)'
   ```
   Always `--update-env-vars`, never `--set-env-vars` (it wipes every other
   variable). If the real URL differs from the expected one, fix the webhook URL
   (A.2) and the LIFF endpoint (A.3).

## Railway staging (today)

Until the Cloud Run staging service exists, staging runs on Railway
(https://shrimpscan-line-bot-staging.up.railway.app, from `launch-prep`). Set
these six variables on that service (Variables tab), never in a file, a
commit or a chat:

| Variable | What it is |
|---|---|
| `SUPABASE_URL` | the database's API URL. For now **prod's** (Bear, 2026-10-29) |
| `SUPABASE_SERVICE_ROLE_KEY` | that project's service role key |
| `SIZING_SERVICE_URL` | line-bot's sizing service (`/v1/rim`, `/v1/measure`) |
| `SIZING_SERVICE_SECRET` | its shared secret |
| `SCAN_DAILY_LIMIT` | measured photos per farm per day, default 20; at least the farm's pond count |
| `BETA_ACCESS_CODE` | รหัสเข้าร่วม a new owner types before making a farm. Unset = any code passes |

Because staging writes to prod for now, the server touches only farms this OA
created (`created_via = 'shrimp_scan_oa'`). To check what the two `SUPABASE_*`
values point at, have them in your shell (or an untracked `.env`, which git
ignores) and run `pnpm db:smoke`: read only, it prints prod or staging and
counts, never a value or an id.

## D. Check each environment

1. `<URL>/health` answers `{"status":"ok", ...}`.
2. `<URL>/api/liff-config` shows a `build_id` newer than the commit, this
   environment's `liffId`, and `env` (`staging` or `production`).
3. "Verify" on the webhook in the Developers Console succeeds.
4. Add the OA as a friend: the greeting arrives. Send any text: the placeholder
   arrives with the LIFF button.
5. Open `https://liff.line.me/<LIFF_ID>` in LINE. With the database variables
   set (below), a new person lands on starting a farm; someone whose farm is in
   น้องน้ำ gets 403 `use_nong_nam` (no screen of its own yet, so the generic
   error). Without them the screens answer 503 `db_not_configured`. Only
   sending a sheet into the chat still shows ส่วนนี้ยังไม่เปิดใช้ค่ะ
   (code 501). A 401 or a login loop means A.3 or C.4 is wrong.
6. Prove which OA each token belongs to, from this PC:
   ```bash
   cp .env.staging.example .env.staging   # fill in, never commit
   node --env-file=.env.staging --import tsx scripts/line-whoami.ts
   ```
   Do the same with a prod file (`LINE_CHANNEL_TARGET=prod`). The two `basicId`s
   must differ.
7. `LINE_CHANNEL_SECRET=<that secret> pnpm webhook:test <URL>/webhook` prints
   200, 200, 403.

## E. Open decisions

- **The product name**, then the slug (top of this file).
- **Min instances.** 0 everywhere today; set prod to 1 at launch so the first
  message after a quiet hour is not slow (`_MIN_INSTANCES` on the prod trigger).
- **Max instances** per environment (`_MAX_INSTANCES`, default 2).
- **A custom domain** later. The webhook URL and the LIFF endpoint move with it.
- **The backup mirror** (line-bot's `mirror-backup.yml`): needs a backup repo
  and a `BACKUP_REPO_PAT`.
- **The worker's word**: ลูกน้อง (the mock) or คนงาน (น้องน้ำ).
