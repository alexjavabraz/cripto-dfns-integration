# ============================================================
# Stage 1 — Build
# ============================================================
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript only (artifacts/ are pre-compiled and committed)
RUN npx tsc

# ============================================================
# Stage 2 — Runtime
# ============================================================
FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JS
COPY --from=builder /app/dist ./dist

# Copy Hardhat artifacts (needed at runtime for contract deployment)
COPY artifacts/ ./artifacts/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
