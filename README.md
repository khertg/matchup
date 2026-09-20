# Matchup

Free, offline-first pickleball open play manager (see [docs/pickleq-specs.md](docs/pickleq-specs.md)).

## Repository layout

An npm-workspaces monorepo:

```
apps/web        React app (Vite, Tailwind, shadcn/ui, Dexie, PWA) and its tests
apps/api        Node API (Fastify + Postgres): clubs, live board, club leaderboard (see apps/api/README.md)
packages/shared wire contract used by both: types, snapshot validation, slug rules
docs/           product spec
supabase/       previous cloud backend, being replaced by apps/api
deploy/         production deployment files (added later)
```

Run everything from the repository root: `npm install` once, then the scripts below. Each script runs in every workspace that defines it.

**Stack:** React, Vite, TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, vite-plugin-pwa, Vitest.

## Scripts

- `npm run dev`: start the dev server
- `npm run build`: type-check and build (also generates the service worker)
- `npm test`: run unit tests
- `npm run typecheck`: type-check every workspace
- `npm run lint`: lint every workspace with oxlint
- `npm run test:e2e`: Playwright end-to-end tests (desktop and mobile Chrome) against production builds; `npm run test:e2e:ui` opens the interactive runner. First run needs `npx playwright install chromium`. Tests and config live in `apps/web/e2e` and `apps/web/playwright.config.ts`. Cloud features run against a second build (`npm run build:cloudtest`) that talks to a **real API** (embedded Postgres, started automatically for each run), so the whole stack is tested end to end.
- `npm run test:db`: applies the Supabase migration to a throwaway Postgres in Docker and checks its security rules (needs Docker running).

Requires Node 20.19+ (built with Node 26).

## Using the app

1. **Setup:** location, number of courts (1 to 15), Doubles or Singles, average game length, and (for doubles) a matchmaking mode.
2. **Check-in tab:** add players by name and skill level (gender is optional, required for mixed doubles). Returning players auto-complete from the saved roster (IndexedDB). Matches stage automatically as soon as a court is free and enough players wait. In doubles you can lock two players as partners: they share a team and wait in the queue together.
3. **Board tab:** courts show both teams; press "Team A won" or "Team B won" to record a result. Players rejoin the back of the queue and the court refills. Undo is available for 10 seconds, until anything else changes. The replace button next to a player swaps in someone waiting.
4. **Standings tab:** ranked by wins, then opponent strength, then win rate, with medals for the top three and a downloadable square stats card per player.
5. **End session:** shows the final top players and can save results to the all-time (lifetime) leaderboard, which is available from the setup screen with a minimum-games filter.

Matchmaking modes (doubles): *Auto-balanced* (first come, first served, even teams), *Skill-separated*, *Winners vs. Losers*, and *Mixed doubles* (one man and one woman per team). Mixed doubles never stages a non-mixed game on its own; if no valid group exists yet, use "Start with waiting players" on the open court.

The active session is saved on the device, so a reload or going offline keeps it.

## Cloud sync and live board (optional)

With the API running (see [apps/api/README.md](apps/api/README.md); `npm run dev -w @matchup/api` needs no database) the setup screen offers a **Cloud club**. Staff create a club (and get a one-time **recovery code**) or log in, then get:

- a **live board** at `/club/<your-club>` that players open from a QR code (**Share live view**): courts, queue with wait times, and standings, updating by itself;
- **resume** of a running session on a second staff device;
- an **all-time club leaderboard** combined across devices.

Point the web app at the API with `VITE_API_URL=/api` (see `apps/web/.env.example`; the dev server proxies `/api` to `http://localhost:8787`). Without it the app runs entirely on the device and every cloud feature is hidden. Changes made offline are held and sent when the connection returns.

## UI (shadcn/ui)

Components live in `apps/web/src/components/ui` and are ours to edit. Add more with `npx shadcn@latest add <name>`. Import them via the `@/` alias, e.g. `@/components/ui/button`. Theme tokens (green primary, light and dark) are in `apps/web/src/index.css`; dark mode is toggled through `next-themes`.

## Docker

- `docker compose up dev`: hot-reload dev server at http://localhost:5173
- `docker compose --profile prod up --build web`: production build served by nginx at http://localhost:8080

## Court rotation

`apps/web/src/rotation/engine.ts` is a pure, immutable engine (check-in, queue, court assignment, results, substitutions, wait estimates). Keep the previous state to implement the 10-second undo.
