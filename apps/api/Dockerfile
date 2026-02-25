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

# Verify build succeeded (fails loudly if dist/main.js missing)
RUN echo "=== Build output ===" && ls -la dist/ && test -f dist/main.js && echo "=== BUILD OK ==="

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

# Start: push schema to DB → seed admin data → run API
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && (node dist/prisma/seed.js || echo 'Seed skipped') && node dist/main"]
