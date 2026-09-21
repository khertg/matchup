/**
 * Schema migrations, applied in order and recorded in schema_migrations.
 * Never edit a migration that has shipped: add a new one instead.
 * They live in TypeScript (not .sql files) so they are bundled with the server
 * and work the same under tsx, tsup and the tests.
 */
export interface Migration {
  id: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_init',
    sql: `
      create table clubs (
        slug          text primary key
                      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
        name          text not null check (char_length(name) between 1 and 80),
        password_hash text not null,
        -- SHA-256 of the one-time recovery code (high entropy, so a fast hash is enough).
        recovery_hash text not null,
        created_at    timestamptz not null default now()
      );

      -- Staff tokens. Only the SHA-256 of a token is stored.
      create table club_tokens (
        token_hash text primary key,
        club_slug  text not null references clubs (slug) on delete cascade,
        expires_at timestamptz not null
      );
      create index club_tokens_club_idx on club_tokens (club_slug);
      create index club_tokens_expires_idx on club_tokens (expires_at);

      -- What the public viewer page renders (no genders, no results history).
      create table live_sessions (
        club_slug  text primary key references clubs (slug) on delete cascade,
        state      jsonb not null,
        updated_at timestamptz not null default now()
      );

      -- The full session, so a second staff device can resume it. Never public.
      create table session_backups (
        club_slug  text primary key references clubs (slug) on delete cascade,
        state      jsonb not null,
        updated_at timestamptz not null default now()
      );

      create table club_players (
        club_slug text not null references clubs (slug) on delete cascade,
        name_key  text not null,
        name      text not null,
        games     integer not null default 0 check (games >= 0),
        wins      integer not null default 0 check (wins >= 0),
        losses    integer not null default 0 check (losses >= 0),
        primary key (club_slug, name_key)
      );

      -- Makes retrying a leaderboard upload safe: a batch id is applied at most once.
      create table lifetime_batches (
        club_slug text not null references clubs (slug) on delete cascade,
        batch_id  uuid not null,
        primary key (club_slug, batch_id)
      );
    `,
  },
  {
    id: '002_session_history',
    sql: `
      -- Ended sessions, so a club can look back at them and resume one from any staff device.
      -- Only reachable with a staff token.
      create table session_history (
        club_slug text not null references clubs (slug) on delete cascade,
        id        uuid not null,
        location  text not null,
        mode      text not null check (mode in ('doubles', 'singles')),
        players   integer not null check (players >= 0),
        games     integer not null check (games >= 0),
        ended_at  timestamptz not null,
        state     jsonb not null,
        primary key (club_slug, id)
      );
      create index session_history_recent_idx on session_history (club_slug, ended_at desc);
    `,
  },
  {
    id: '003_media',
    sql: `
      -- The club's logo, one per club. Images are stored as base64 text; the server checks
      -- the bytes are a PNG, JPEG or WebP and of a sensible size before saving.
      create table club_logos (
        club_slug    text primary key references clubs (slug) on delete cascade,
        content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
        data         text not null,
        updated_at   timestamptz not null default now()
      );

      -- Player avatars, by lower-case player name (the same key as the club leaderboard).
      create table club_avatars (
        club_slug    text not null references clubs (slug) on delete cascade,
        name_key     text not null check (char_length(name_key) between 1 and 80),
        kind         text not null check (kind in ('photo', 'emoji', 'initials')),
        emoji        text,
        color        text check (color ~ '^#[0-9a-f]{6}$'),
        content_type text check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
        photo        text,
        updated_at   timestamptz not null default now(),
        primary key (club_slug, name_key)
      );
    `,
  },
]
