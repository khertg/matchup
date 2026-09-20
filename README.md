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

## UI (shadcn/ui)

Components live in `src/components/ui` and are ours to edit. Add more with `npx shadcn@latest add <name>`. Import them via the `@/` alias, e.g. `@/components/ui/button`. Theme tokens (green primary, light and dark) are in `src/index.css`; dark mode is toggled through `next-themes`.

## Docker

- `docker compose up dev`: hot-reload dev server at http://localhost:5173
- `docker compose --profile prod up --build web`: production build served by nginx at http://localhost:8080

## Court rotation

`src/rotation/engine.ts` is a pure, immutable engine (check-in, queue, court assignment, results, substitutions, wait estimates). Keep the previous state to implement the 10-second undo.
