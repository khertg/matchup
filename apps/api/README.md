# Matchup API

The server behind the optional cloud features: club login, the public live board, resuming a session on a
second device, and the club leaderboard. It is a small [Fastify](https://fastify.dev) app on Postgres.

The web app works fully without it. Everything here is opt-in.

## Run it

```bash
npm install                      # once, from the repository root
npm run dev -w @matchup/api      # http://localhost:8787, hot reload
```

With no configuration it uses an **embedded Postgres (PGlite)** stored in `apps/api/.data`, so you need no
database or Docker to develop. To use a real Postgres, set `DATABASE_URL` (see `.env.example`). The schema is
created automatically on start.

## Configuration

All settings are environment variables. Nothing is required in development.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `pglite://./.data` | `postgres://user:pass@host:5432/db` in production. `pglite://memory` for throwaway data. **Required in production**; the embedded database is refused there. |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Where to listen. |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy (Caddy, nginx) so rate limits see the real client address. |
| `ALLOWED_ORIGINS` | none | Comma-separated origins allowed to call the API from a browser. Leave empty when the web app and API share one origin (the normal setup). |
| `TOKEN_TTL_DAYS` | `30` | How long a staff login lasts. |
| `LIVE_TTL_HOURS` | `24` | A live board nobody has updated for this long counts as ended. |
| `RATE_LIMIT_MAX` | `300` | Requests per minute per address, all routes. |
| `RATE_LIMIT_AUTH_MAX` | `10` | Create club, login and password reset, per 15 minutes per address (each has its own budget). |
| `RATE_LIMIT_WRITE_MAX` | `240` | Publish and clear, per minute per address. |
| `LOGIN_MAX_FAILURES_PER_IP` | `5` | Wrong passwords for one club from one address per 15 minutes before it is locked. |
| `LOGIN_MAX_FAILURES_PER_CLUB` | `25` | The same, counted across all addresses. |
| `MAX_SUBSCRIBERS_PER_IP` / `_TOTAL` | `20` / `2000` | Open live-board streams. |
| `SSE_HEARTBEAT_MS` | `25000` | Keep-alive interval for live-board streams. |
| `LOG_LEVEL` | `info` | pino log level. |

## API

Everything is under `/api` and speaks JSON. Errors look like `{ "error": "<code>", "message": "..." }`
(codes are listed in `packages/shared/src/protocol.ts`). Staff routes need `Authorization: Bearer <token>`.

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /clubs` `{name, slug, password}` | none | Create a club. Returns `{token, recoveryCode}`; the recovery code is shown **once**. `409 club_slug_taken`, `400 weak_password` / `invalid_club`. |
| `POST /clubs/:slug/login` `{password}` | none | Returns `{token, name}`. An unknown club and a wrong password give the same `401 invalid_credentials`. |
| `POST /clubs/:slug/reset-password` `{recoveryCode, newPassword}` | none | Set a new password using the recovery code. Revokes every login and returns a new `{token, recoveryCode, name}`. |
| `POST /logout` | staff | End this login. |
| `PUT /session` `{public, full}` | staff | Publish the running session. `public` is validated and stripped to known fields; `full` is a private backup. |
| `GET /session` | staff | The private backup, for resuming on another device (`404` if none). |
| `DELETE /session` | staff | The session ended. |
| `POST /lifetime` `{batchId, players[]}` | staff | Add a session's totals to the club leaderboard. A `batchId` is applied once, so retries are safe. |
| `GET /clubs/:slug/live` | none | The public live board, with `ETag` (`304` when unchanged). `404` for an unknown club and for a club with no session, identically. |
| `GET /clubs/:slug/live/stream` | none | Server-Sent Events: `update` (carries the board) and `cleared`, plus a heartbeat. |
| `GET /clubs/:slug/players` | none | The club leaderboard. |
| `GET /health` | none | Liveness, checks the database. |

There is deliberately **no endpoint that lists clubs**.

## Security notes

- **Passwords** are hashed with argon2id. **Staff tokens** are 32 random bytes; only their SHA-256 is stored, and
  they expire. The **recovery code** (100 bits) is stored as a SHA-256 and is single use.
- **Rate limits** per address, stricter for login, create and reset, plus a **lockout per club** after repeated
  failures (clubs that do not exist are counted the same way, so lockouts reveal nothing). Login for an unknown
  club does the same hashing work as a wrong password, so timing reveals nothing either.
- The **live board never contains private data**: the public snapshot is copied field by field, so a genders or
  results history sent by a buggy client cannot reach viewers.
- Requests are validated strictly (no type coercion, unknown fields rejected), bodies are capped, errors never
  include internal detail, and secrets are never logged.
- **Limits of the current design:** the login lockout and the live-stream fan-out are in memory, which is right
  for one server. Running several instances would need Postgres `LISTEN/NOTIFY` and a shared limiter.

## Tests

```bash
npm test -w @matchup/api                       # embedded Postgres, no Docker needed
TEST_DATABASE_URL=postgres://... npm test -w @matchup/api   # the same suite on a real Postgres
```

The suite covers every route, authentication and expiry, rate limits and lockouts, privacy of the public board,
Server-Sent Events over a real connection, migrations, and configuration. Run it against real Postgres before a
release.

## Layout

```
src/index.ts        start-up: config, database, migrations, listen, graceful shutdown
src/app.ts          builds the Fastify app (plugins, errors); used by tests too
src/config.ts       environment variables
src/db/             database driver (Postgres and PGlite), migrations
src/services/       the rules: clubs, sessions, leaderboard, tokens, passwords, lockout
src/routes/         HTTP layer only: validation and calling services
src/realtime.ts     live-board fan-out
```
