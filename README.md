# Matchup

Free, offline-first pickleball open play manager (see [docs/pickleq-specs.md](docs/pickleq-specs.md)).

## Repository layout

An npm-workspaces monorepo:

```
apps/web        React app (Vite, Tailwind, shadcn/ui, Dexie, PWA) and its tests
apps/api        Node API (Fastify + Postgres): clubs, live board, club leaderboard (see apps/api/README.md)
packages/shared wire contract used by both: types, snapshot validation, slug rules
docs/           product spec
deploy/         production deployment: Caddy + API + Postgres on one server (see deploy/README.md)
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
- `npm test -w @matchup/api`: the API suite on embedded Postgres; set `TEST_DATABASE_URL` to run it on a real Postgres instead (CI does both).

Requires Node 20.19+ (built with Node 26).

## Using the app

1. **Setup:** location, number of courts (1 to 15), Doubles or Singles, average game length, and (for doubles) a matchmaking mode.
2. **Check-in tab:** add players by name and skill level (gender is optional, required for mixed doubles). Returning players auto-complete from the saved roster (IndexedDB). Skill levels run Beginner, Novice, Intermediate, Upper Intermediate, Advanced and Expert, each shown with the official [USA Pickleball skill rating](https://usapickleball.org/skill-level/) it lines up with (1.0, 2.0-2.5, 3.0, 3.5, 4.0-4.5, 5.0+). Tap a player's level badge anywhere on the Board or Check-in tab (or in the roster list) to change it: it is saved to their roster entry, and matching and Next up use the new level from then on, while games already on a court and recorded results stay as they were. To check in regulars in one go, tick them in **Check in from the roster** (they queue in the order you tick them, with their saved skill and gender) and press one button. In doubles you can lock two players as partners: they share a team and wait in the queue together, at the later partner's place, so a lock never moves anyone ahead of people who were waiting. If one of them is on a court or a break when you lock, the app asks first: the lock waits until both have finished a game, and each keeps their own turn until then.
3. **Board tab:** **games never start by themselves.** The **Next up** card, just above the queue, shows the next four players (two in singles), already split into Team A and Team B, and the queue marks them too. Press **Start game** on the court that is free to put them on it; Next up then moves on to the following four. Courts show both teams; press "Team A won" or "Team B won" and enter the score in the pop-up (0 to 99 each; the winner's box starts at 11, so you only type the other score; the winner's score must be higher, and every game is finished with a score). Closing the pop-up records nothing. Each court shows how long its game has been going, and finishing a game adds that time (at most 3 hours) to everyone on the court. Players rejoin the back of the queue and the court stays open until you start the next game. Players on a break are skipped. Undo is available for 10 seconds, until anything else changes. **Cancel game** asks first, since nothing is recorded and it cannot be undone. Players watching the live page see the same Next up card. The replace button next to a player on a court swaps in someone waiting: the player who comes off goes to the front of the queue, or on a break if you tick that. The same button next to a player in **Next up** puts a different waiting player in the group (the replaced player keeps their place in the queue); the group stays as you set it until a game starts or someone in it leaves the queue, and **Reset** returns to the automatic group. **Manage courts** is where courts are added mid-session (there is no separate Add court button on the Board), renamed, reordered or closed. Closing a court with a game in progress asks first, then puts its players back at the front of the queue.
4. **Standings tab:** ranked by wins, then point differential (from entered scores; winner-only results add no points), then opponent strength, then win rate, with medals for the top three, each player's time played, and a downloadable square stats card per player.
5. **End session:** shows the final top players and can save results to the all-time (lifetime) leaderboard, which is available from the setup screen with a minimum-games filter. **Every ended session is kept** under **Past sessions** on the setup screen, with its full ranking, whether or not the results were saved to the all-time totals. Ended by accident? A **Resume** button stays on screen for 30 seconds after ending, and any past session can be resumed later exactly as it ended (queue, games in progress, standings). A resumed session only adds the games played since to the all-time totals, so nothing is counted twice. Sessions are stored on the device (the latest 100), and also in the club cloud when signed in, so history and resume work from another staff device.

Matchmaking modes (doubles): *Auto-balanced* (first come, first served, even teams), *Skill-separated*, *Winners vs. Losers*, and *Mixed doubles* (one man and one woman per team). Mixed doubles never offers a non-mixed group as next up; if no valid group exists yet, use "Start with waiting players" on an open court.

The active session is saved on the device, so a reload or going offline keeps it.

## Club logo and player avatars

Every player has a round **avatar** and the club can have a **logo**, both changeable at any time.

- **Avatars:** with nothing set a player shows their initials on a colour taken from their name. **Tap any avatar to see the picture large** (on the Board, Next up, courts, Check-in lists, roster list and standings, and on the players' live page). Staff get a **Change avatar** button in that large view to choose a **photo** (from a file, or taken with the camera on a phone), an **emoji**, or a **colour**, or to remove it. After choosing or taking a photo you **crop it yourself**: drag the picture inside the round frame and pinch, scroll or use the slider to zoom (arrow keys and + / - work too). Photos are saved as a 128px square and shrunk, so they stay small and work offline. An avatar belongs to the roster player, so it shows everywhere they appear, in every future session, on the stats card and on the end-of-session podium.
- **Logo:** add or change it with the **Club logo** button on the setup screen. You can optionally **crop it with a free rectangle** (or use the whole picture). It shows on the setup screen, the session header, the stats card and the players' live page.
- **In the club cloud (signed in):** the logo and emoji and initials avatars are sent to the club, so the players' live page and other staff devices show them. **Photos are not shared unless staff switch on "Show player photos on the live page"** in the club panel (off by default, because anyone with the live link can then see them); switching it off removes the photos from the server. A device's own avatar wins over the club's for the same player, and the club's is matched by name.

## Cloud sync and live board (optional)

With the API running (see [apps/api/README.md](apps/api/README.md); `npm run dev -w @matchup/api` needs no database) the setup screen offers a **Cloud club**. Staff create a club (and get a one-time **recovery code**) or log in, then get:

- a **live board** at `/club/<your-club>` that players open from a QR code (**Share live view**): courts, queue with wait times, and standings, updating by itself;
- **resume** of a running session on a second staff device;
- an **all-time club leaderboard** combined across devices.

Point the web app at the API with `VITE_API_URL=/api` (see `apps/web/.env.example`; the dev server proxies `/api` to `http://localhost:8787`). Without it the app runs entirely on the device and every cloud feature is hidden. Changes made offline are held and sent when the connection returns.

## Version

The app shows its build at the bottom of every screen (login, setup, session and the players' live page), for example `v0.1.0 · a1b2c3d · 21 Sep 2026`: the release number, the git commit it was built from and the build date. It tells you which build a phone is really running, which matters for an installed app that updates itself in the background. Hover it for the full details. `GET /api/health` reports the API's own `version` and `commit`. A local build shows `dev` when git is not available, and Docker builds need `--build-arg GIT_SHA=$(git rev-parse --short HEAD)` (the compose files pass it through from the `GIT_SHA` environment variable).

**To release:** bump the one number in the root `package.json` (`npm version minor --no-git-tag-version` at the repo root), commit it, and deploy. The workspace packages stay `0.0.0`; nothing reads them.

## UI (shadcn/ui)

Components live in `apps/web/src/components/ui` and are ours to edit. Add more with `npx shadcn@latest add <name>`. Import them via the `@/` alias, e.g. `@/components/ui/button`. Theme tokens (green primary, light and dark) are in `apps/web/src/index.css`; dark mode is toggled through `next-themes`.

## Docker

**Development** (`docker-compose.yml`): the web app, the API and a Postgres database, all with hot reload.

```bash
docker compose up            # web http://localhost:5173, API http://localhost:8787, Postgres on :5432, Adminer http://localhost:8080
docker compose down -v       # after changing dependencies, so the containers get the new packages
```

The web app proxies `/api` to the API, so the cloud features work with no extra setup. You can also run each
piece without Docker: `npm run dev` (web) and `npm run dev -w @matchup/api` (API, with an embedded database).

**Production** is one small server running Caddy, the API and Postgres. See [deploy/README.md](deploy/README.md)
for the step-by-step guide, backups and updates.

## Court rotation

`apps/web/src/rotation/engine.ts` is a pure, immutable engine (check-in, queue, court assignment, results, substitutions, wait estimates). Keep the previous state to implement the 10-second undo.
