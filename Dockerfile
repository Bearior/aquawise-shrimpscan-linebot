# Shrimp Scan LINE bot, Cloud Run image.
#   docker build -t shrimpscan-line-bot .
#   docker run -p 8080:8080 shrimpscan-line-bot
# It boots with no LINE secrets: /health and /liff answer, /webhook and
# /api/liff/* answer 503 until the service is given its channel.

# ── builder: the full dependency tree, because tsc and Vite run here ─────────
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY public ./public
COPY liff-app ./liff-app

# One bundle for staging AND prod. The LIFF id is never baked: the app reads it
# from /api/liff-config at runtime, so this stays empty.
ARG VITE_LIFF_ID=""

# The build id goes into a FILE (/app/build-id) that both the server and the
# LIFF build read (vite.config.ts reads ../build-id). line-bot learned that an
# env var set here does not reliably reach the Vite process; the file does.
RUN cd liff-app && pnpm install --frozen-lockfile && \
    date -u +%Y%m%d%H%M%S > /app/build-id && \
    VITE_LIFF_ID=${VITE_LIFF_ID} pnpm run build

# The server only. `pnpm run build` would run `prebuild` and build the LIFF a
# second time.
RUN pnpm exec tsc -p tsconfig.build.json

# ── prod-deps: runtime dependencies only ─────────────────────────────────────
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs scanbot

COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# A dev dependency in the runtime image is weight and attack surface; fail the
# build instead of shipping it.
RUN for pkg in typescript vitest vite tsx eslint supertest dotenv; do \
      if [ -d "node_modules/$pkg" ]; then \
        echo "dev dependency '$pkg' leaked into the runtime image" >&2; exit 1; \
      fi; \
    done

COPY --from=builder /app/public ./public
COPY --from=builder /app/build-id ./build-id

ENV NODE_ENV=production
ENV PORT=8080
USER scanbot
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]
