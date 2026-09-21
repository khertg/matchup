# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Matchup is a free, offline-first pickleball open-play manager (product spec: `docs/pickleq-specs.md`, user-facing overview: `README.md`). npm-workspaces monorepo: `apps/web` (React 19, Vite, Tailwind v4, shadcn/ui, Zustand, Dexie), `apps/api` (Fastify + Postgres), `packages/shared` (wire contract used by both), `deploy/` (Caddy + API + Postgres).

## Commands

Run from the repo root unless noted. Each script runs in every workspace that defines it.

- `npm run dev` (web), `npm run dev -w @matchup/api` (API on 8787, embedded PGlite, no database needed), or `docker compose up` (web 5173 + API + Postgres + Adminer on 8080, hot reload)
- `npm test`, `npm run typecheck`, `npm run build`
- `npm run lint` (root only, oxlint over `apps packages`; workspaces have no lint script)
- One unit test: `cd apps/web && npx vitest run src/rotation/engine.test.ts -t "part of the name"` (same in `apps/api`, `packages/shared`)
- E2E: `cd apps/web && npx playwright test e2e/session.spec.ts --project=desktop`. Flags do not pass through `npm run test:e2e --`; call `npx playwright test` directly. Projects: `desktop`, `mobile`, `cloud`, `cloud-mobile` (cloud specs live in `e2e/cloud/` and run against a second build plus a real API on port 8788 that Playwright starts). First run needs `npx playwright install chromium`.
- API on real Postgres: `TEST_DATABASE_URL=postgres://... npx vitest run` in `apps/api`. That suite **drops the `public` schema**, so point it at a throwaway database, never the dev one.

Node 20.19+ (built with Node 26). CI (`.github/workflows/ci.yml`) runs unit, API-on-Postgres, docker and e2e jobs.

## Architecture

### The rotation engine is pure; the store is a thin wrapper
`apps/web/src/rotation/engine.ts` holds every session rule as pure, immutable functions over `SessionState` (`rotation/types.ts`); `store/session.ts` (Zustand + persist to localStorage) only calls them. Undo is the store keeping `previous`, which almost every action clears; settings-like actions (`setAvgGameMinutes`, `setPlayerSkill`) instead carry their change into `previous`. The engine never reads the clock: the store passes `now`.

Behaviours that span several files:
- **Nothing starts by itself.** Staff press Start game. `nextGroup()` computes the group (matchmaking in `matchmaking/grouping.ts`), `startGame()` puts it on a court. The same `nextGroup()` feeds the Next up card, the queue badges and the published live board, so what staff see is what starts. `fillCourts` in `rotation/testing.ts` is a test-only helper.
- **Next up can be hand-picked** (`nextUpPick`); it is honoured only while every member still waits and is cleared by anything that removes them from the queue.
- **Partners and opponents rotate in every mode** (`matchmaking/grouping.ts`). `pairHistory` reads the last `RECENT_MATCHES` games from `state.matches`; `selectGroup` adds `repeatPenalty` to a group's queue cost (so a foursome that just played counts as further back, in all four modes), and `splitGroup` picks the split with the fewest repeated partners, then opponents, among splits within `LOPSIDED_LIMIT` of the most balanced one (then smallest gap, then longest ago). Without this the tie-break kept `[a,b]` vs `[c,d]`, i.e. last game's partners, because teams rejoin the queue side by side. Locks and mixed-doubles rules are applied before any of it.
- **Partner locks** have two forms: `partners` (in force) and `pendingPartners` (made while a partner was on a court or break; they take effect once both finish a game). In-force pairs stand at the *later* partner's queue spot so a lock never lets someone skip the line.
- **Games are finished with a score** (`recordScore`); `recordResult` (no score) remains in the engine but the UI does not use it. Ranking: wins, point differential, opponent strength, win rate, name (`rotation/standings.ts`).
- Skill levels are stored as 1 to 6 (`lib/skill.ts` maps them to names and USA Pickleball ratings). Changing the number range means migrating roster, sessions, history and the wire validator.

### Persisted shapes and migrations
`SessionState` is persisted in three places: localStorage (the running session), Dexie `history` records, and cloud backups. All go through `migrateSession(session, fromVersion)` in `store/migrate.ts`, so **any change to a persisted shape needs a `SESSION_STORE_VERSION` bump plus a migration step**, unless the new field is optional and absent means "none" (the pattern used for `nextUpPick`, `pendingPartners`). Store-level fields beside the session (`sessionId`, `startedAt`, `lifetimeCounted`) are migrated in the store's own `migrate`. Dexie schema versions are in `db/db.ts`.

### History, resume and all-time totals
Ending a session archives it (`db/history.ts`) whether or not results are saved. Saving to the all-time totals adds only `stats - lifetimeCounted` (`rotation/lifetime.ts`), so a resumed session never double counts, locally or on the club leaderboard. Player ids come from the local roster (Dexie), so they are only meaningful on the device that made them.

### Avatars and the club logo
Avatars and the logo are deliberately **outside the session and the live snapshot** (photos would break the 256 KB backup and the localStorage budget). A player's avatar lives on the roster row (`Player.avatar`, Dexie, with an `avatarDirty` flag for pending uploads); the logo and the photo-sharing switch live in the Dexie `settings` table. `lib/avatars.ts` resolves what to draw: this device's roster avatar by id, else the club's avatar by lower-case name (fetched from `GET /clubs/:slug/avatars` by `AvatarProvider`, also on the live page), else automatic initials. `syncMedia` in `cloud/sync.ts` uploads changes; **photos only go while "Show player photos on the live page" is on** and are taken down when it is turned off. Picking a photo goes through a crop step first: the pure maths is in `lib/crop.ts` (`PhotoCropper` is the UI; circle mode for avatars, rect mode for the logo) and `processImage(file, kind, crop?)` applies it (no crop = centred square / whole picture). Initials and emoji are drawn from `data-*` attributes with CSS `content`, so avatars add no text to the page (tests that read row text rely on this).

### Cloud and the wire contract
When a cloud is configured (`VITE_API_URL`), the app is **gated by a club login**: `App.tsx` shows `LoginGate` (via `requiresLogin` in `cloud/gate.ts`) until `useClubAuth` has a club, except on the public `/club/<slug>` viewer. The saved token keeps the app usable offline; `checkLogin` in `cloud/sync.ts` asks the server once at launch and when the connection returns, and only an `invalid_token` answer signs out. A build with no API has no login (the local e2e projects rely on this). A new recovery code is held in `cloud/recovery.ts` and shown by `RecoveryCodeHost` in `App`, because creating a club replaces the login screen under the dialog that made it.

`packages/shared` defines everything that crosses HTTP: `PublicSnapshot` (what the public `/club/<slug>` page shows; genders and results history are deliberately excluded), `FullBackupEnvelope` (private, for resuming), history and lifetime requests. The web app talks only to the `CloudApi` interface (`cloud/api.ts`; `httpApi.ts` implements it); `cloud/sync.ts` and `cloud/publisher.ts` publish the running session (debounced, offline-tolerant) and `syncHistory` uploads ended sessions. The API validates through the shared parsers, which return a **fresh copy with only known fields**. When adding a wire field, make it optional on input and default it in the copy so an older cached web app can still publish. The viewer page reuses the staff components in read-only mode (no callbacks passed).

`apps/api`: routes in `src/routes`, logic in `src/services`, TypeScript migrations in `src/db/migrations.ts` (append only; a test lists the expected tables), PGlite in dev and tests, real Postgres in production.

### Version
The version has one source of truth: `version` in the **root** `package.json` (bump with `npm version minor --no-git-tag-version` at the root; workspace versions are unused). `vite.config.ts` (web) and `tsup.config.ts` (API) inject it with `define` along with the short commit (`GIT_SHA` env, else `git rev-parse`, else `dev`) and build date. Docker builds cannot see `.git`, so both Dockerfiles take a `GIT_SHA` build arg (the prod compose file and CI pass it). The web app renders it once in `App.tsx` (`VersionLabel`, `lib/version.ts`); the API reports it on `GET /api/health`. Running from source (tests, tsx) reports `dev` for the API.

## Conventions and pitfalls

- Tests that need a running board start games explicitly (`startGame`/`fillCourts`), never rely on check-in doing it. E2E helpers live in `apps/web/e2e/helpers.ts` (`startSession`, `checkIn`, `startGame`, `recordWin`, `cancelGame`).
- E2E gotchas: Sonner toasts linger about 10 seconds, so `getByText('Court 1: Team A won')` can match twice; Radix Tabs unmount inactive tabs (switch to Board before looking for court controls); while a dialog is open, `getByRole` cannot see the page behind it (aria-hidden); the Next up card contains list items, so scope queue rows with `ol > li`.
- The working tree can be CRLF on Windows. When scripting edits, normalise line endings first. Avoid backticks and `$'` in shell heredocs or `node -e` strings; use the editor tools for code containing template literals.
- Commit and push only when asked.
