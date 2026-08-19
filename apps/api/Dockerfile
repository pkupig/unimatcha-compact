# ─── Stage 1: Builder ──────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile TypeScript
COPY . .
RUN npm run build

# tsc does not copy non-TS assets; bring the metadata seed JSON into dist so the
# packaged image can serve UK universities/cities/majors (read via __dirname/seed).
RUN mkdir -p dist/src/metadata/seed && cp src/metadata/seed/*.json dist/src/metadata/seed/

# Verify build succeeded (fails loudly if dist/main.js or seed assets missing)
RUN echo "=== Build output ===" && ls -la dist/src/ \
    && test -f dist/src/main.js \
    && test -f dist/src/metadata/seed/uk_universities.json \
    && echo "=== BUILD OK ==="

# ─── Stage 2: Runner ───────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# Install OpenSSL (required by Prisma at runtime)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/scripts ./scripts

# Start: push schema → seed admin (idempotent) → run API.
# - 去掉 --accept-data-loss：生产每次启动都跑，带该标志会静默丢弃「被判定为数据丢失」的列/数据；
#   不带则在检测到破坏性变更时 db push 失败退出（安全默认，宁可启动失败也不毁数据）。
# - 演示数据（广场 / 广告）只在 SEED_DEMO=true 时播；否则生产库会被灌入假帖/假广告。
# - dist/prisma/seed.js 用 upsert，幂等，可每次启动跑（建管理员账号）。
# - ensure-search-indexes 补 pg_trgm 扩展与搜索用 GIN 索引（db push 无法声明），幂等；
#   自身吞异常不退出，缺扩展权限时搜索退化为无索引 ILIKE 而非阻断启动。
CMD ["sh", "-c", "npx prisma db push && (node dist/prisma/ensure-search-indexes.js || echo 'Search indexes skipped') && (node dist/prisma/seed.js || echo 'Seed skipped') && ([ \"$SEED_DEMO\" = \"true\" ] && (node scripts/seed-square-demo.js || echo 'Square demo skipped') && (node scripts/seed-ads-demo.js || echo 'Ads demo skipped') || echo 'Demo seed disabled (set SEED_DEMO=true to enable)') && node dist/src/main"]
