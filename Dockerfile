# LiquidityOS API + web app (one container). Build: docker build -t liquidityos .
# ---- web build ----
FROM node:22-alpine AS web
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

# ---- api deps (production only) ----
FROM node:22-alpine AS api-deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 WEB_DIST=/app/web
WORKDIR /app
RUN addgroup -S los && adduser -S los -G los
COPY --from=api-deps /app/node_modules ./node_modules
COPY backend/ ./
COPY --from=web /web/dist ./web
RUN rm -rf data tests .devdb .env && chown -R los:los /app
USER los
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
