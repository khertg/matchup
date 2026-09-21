# syntax=docker/dockerfile:1
# Development image for the web app. Production is built by deploy/Dockerfile.
# The build context is the repository root:  docker build -f apps/web/Dockerfile .

# ---- deps: every workspace manifest, so the lockfile resolves ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# ---- dev: hot-reload server (source is bind-mounted by docker-compose) ----
FROM deps AS dev
ENV USE_POLLING=true
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@q2dink/web", "--", "--host", "0.0.0.0"]
