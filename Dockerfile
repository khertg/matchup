# syntax=docker/dockerfile:1

# ---- deps: install once, reused by every stage ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev: hot-reload server (source is bind-mounted by docker-compose) ----
FROM deps AS dev
ENV USE_POLLING=true
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: type-check + production bundle + service worker ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- prod: static files behind nginx ----
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
