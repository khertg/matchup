# Matchup

Free, offline-first pickleball open play manager (see `pickleq-specs.md`).

**Stack:** React, Vite, TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, vite-plugin-pwa, Vitest.

## Scripts

- `npm run dev`: start the dev server
- `npm run build`: type-check and build (also generates the service worker)
- `npm test`: run unit tests
- `npm run lint`: lint with oxlint
- `npm run test:e2e`: Playwright end-to-end tests (desktop and mobile Chrome) against the production build; `npm run test:e2e:ui` opens the interactive runner. First run needs `npx playwright install chromium`.

Requires Node 20.19+ (built with Node 26).

## Using the app

1. **Setup:** location, number of courts (1 to 15), Doubles or Singles, average game length, and (for doubles) a matchmaking mode.
2. **Check-in tab:** add players by name and skill level (gender is optional, required for mixed doubles). Returning players auto-complete from the saved roster (IndexedDB). Matches stage automatically as soon as a court is free and enough players wait. In doubles you can lock two players as partners: they share a team and wait in the queue together.
3. **Board tab:** courts show both teams; press "Team A won" or "Team B won" to record a result. Players rejoin the back of the queue and the court refills. Undo is available for 10 seconds, until anything else changes. The replace button next to a player swaps in someone waiting.
4. **Standings tab:** ranked by wins, then opponent strength, then win rate, with medals for the top three and a downloadable square stats card per player.
5. **End session:** shows the final top players and can save results to the all-time (lifetime) leaderboard, which is available from the setup screen with a minimum-games filter.

Matchmaking modes (doubles): *Auto-balanced* (first come, first served, even teams), *Skill-separated*, *Winners vs. Losers*, and *Mixed doubles* (one man and one woman per team). Mixed doubles never stages a non-mixed game on its own; if no valid group exists yet, use "Start with waiting players" on the open court.

The active session is saved on the device, so a reload or going offline keeps it.

## UI (shadcn/ui)

Components live in `src/components/ui` and are ours to edit. Add more with `npx shadcn@latest add <name>`. Import them via the `@/` alias, e.g. `@/components/ui/button`. Theme tokens (green primary, light and dark) are in `src/index.css`; dark mode is toggled through `next-themes`.

## Docker

- `docker compose up dev`: hot-reload dev server at http://localhost:5173
- `docker compose --profile prod up --build web`: production build served by nginx at http://localhost:8080

## Court rotation

`src/rotation/engine.ts` is a pure, immutable engine (check-in, queue, court assignment, results, substitutions, wait estimates). Keep the previous state to implement the 10-second undo.
