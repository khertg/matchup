# syntax=docker/dockerfile:1
# Builds the web app and serves it with Caddy.
# The build context is the repository root:  docker build -f deploy/Dockerfile .

FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/web apps/web
# The API is reached on the same origin, so the app just calls /api.
ENV VITE_API_URL=/api
RUN npm run build -w @matchup/web

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web /app/apps/web/dist /srv
