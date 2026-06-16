# Sourdough container image (used by Fly.io and any container host).
# Multi-stage: install deps -> build -> slim runtime from Next's standalone output.
# No native modules (node:sqlite is built into Node), so alpine is fine.

# --- deps -------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# SQLite lives on a mounted volume so it survives deploys/restarts.
ENV DATABASE_PATH=/data/sourdough.db

# Next "standalone" output: a minimal server.js + only the deps it traced.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
