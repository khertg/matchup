# Cloud setup (Supabase)

Cloud is **optional**. Without it Matchup runs entirely on the device. With it you get:

- a public **live board** at `/club/<your-club>` that players open from a QR code,
- **resuming** a session on a second staff device,
- an **all-time club leaderboard** combined across devices.

Everything below uses Supabase's free tier.

## 1. Create the project

1. Sign up at <https://supabase.com> and create a new project (any region close to your players).
2. Open **SQL Editor**, paste the whole of [`migrations/0001_init.sql`](migrations/0001_init.sql) and run it.
   (Or, with the Supabase CLI: `supabase link` then `supabase db push`.)
3. Check **Database, Replication**: the `live_sessions` table should be listed under `supabase_realtime`.
   The migration adds it; if you don't see it, turn it on there.

## 2. Connect the app

1. In **Project Settings, API** copy the **Project URL** and the **anon public** key.
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill them in:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

3. Restart the dev server (`docker compose restart dev`, or stop and rerun `npm run dev`).
   The setup screen now shows a **Cloud club** card.

> Use the **anon** key only. Never put the `service_role` key in this app or in any `VITE_` variable:
> everything in the browser bundle is public. `apps/web/.env.local` is git-ignored.

## 3. Deploy

Set the same two variables in your host's build settings (for example Cloudflare Pages) and build with
`npm run build`. `public/_redirects` makes `/club/<name>` links load the app on Cloudflare Pages/Netlify.
For Docker: `docker compose --env-file apps/web/.env.local --profile prod up --build web`.

## How it is secured

- The app only ever holds the public anon key. Tables have row level security and **no direct writes are
  allowed**; every change goes through `security definer` functions.
- A club is a URL name plus a password. Passwords are hashed with bcrypt (`pgcrypto`). Logging in returns a
  random token; only its SHA-256 hash is stored, it expires after 30 days, and the password is never kept on
  the device. Logging out deletes the token.
- The public live board (`live_sessions`) carries names, skill levels and the queue, but **not** genders or
  results history. The full session (`session_backups`) is only readable with a staff token.
- Leaderboard uploads carry a batch id, so a retry after a dropped connection is never counted twice.

### Things to know

- **The live board is public.** Anyone can read every club's `live_sessions` and `club_players` rows (Realtime
  needs that), so treat player names as public and don't store anything sensitive there.
- **Password guessing is only slowed down** (0.5 s per failed login), not rate limited. Pick a strong club
  password, and consider Supabase's built-in rate limits / CAPTCHA if a club is a target.
- **Last write wins.** If two staff devices run the same club at once, the latest publish overwrites the other.
- **Password recovery is not built in** (it needs email). If a password is lost, delete the club row in the
  SQL editor and create the club again.
- Free projects pause after about a week without activity and Realtime is limited to roughly 200 concurrent
  connections. The viewer also polls every 15 seconds, so it keeps working if websockets are blocked.

## Testing the database

`npm run test:db` starts a throwaway Postgres in Docker, applies the migration on top of stand-ins for
Supabase's roles, and runs [`tests/01_rpc_and_rls.sql`](tests/01_rpc_and_rls.sql). It checks, as the `anon`
role, that secret tables are unreadable, direct writes are refused, tokens work and expire, passwords are
hashed, and retried leaderboard uploads are not double counted.
