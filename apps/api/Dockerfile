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

# Start: push schema → seed admin → seed 广场演示数据 → seed 广告演示数据 → run API
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && (node dist/prisma/seed.js || echo 'Seed skipped') && (node scripts/seed-square-demo.js || echo 'Square demo skipped') && (node scripts/seed-ads-demo.js || echo 'Ads demo skipped') && node dist/src/main"]
