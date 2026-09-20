# syntax=docker/dockerfile:1
# The build context is the repository root:  docker build -f apps/api/Dockerfile --target prod .

# ---- deps: every workspace manifest, so the lockfile resolves ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# ---- dev: hot-reload server (source is bind-mounted by docker-compose) ----
FROM deps AS dev
EXPOSE 8787
# Polling watcher: file-change events do not cross Windows/macOS bind mounts.
CMD ["npm", "run", "dev:docker", "-w", "@matchup/api"]

# ---- build: bundle the server (the shared package is inlined) ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @matchup/api

# ---- prod-deps: only what the running server needs ----
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @matchup/api

# ---- prod: small runtime image, runs as a non-root user ----
FROM node:24-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/package.json apps/api/
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/index.js"]
