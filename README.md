# Matchup

Free, offline-first pickleball open play manager (see `pickleq-specs.md`).

**Stack:** React, Vite, TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, vite-plugin-pwa, Vitest.

## Scripts

- `npm run dev`: start the dev server
- `npm run build`: type-check and build (also generates the service worker)
- `npm test`: run unit tests
- `npm run lint`: lint with oxlint

Requires Node 20.19+ (built with Node 26).

## Docker

- `docker compose up dev`: hot-reload dev server at http://localhost:5173
- `docker compose --profile prod up --build web`: production build served by nginx at http://localhost:8080

## Court rotation

`src/rotation/engine.ts` is a pure, immutable engine (check-in, queue, court assignment, results, substitutions, wait estimates). Keep the previous state to implement the 10-second undo.
