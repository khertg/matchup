-- Matchup cloud schema: clubs, live sessions, and all-time club leaderboards.
--
-- Security model
--   * The app talks to Supabase with the public anon key only.
--   * Tables have row level security on. Anyone may READ live sessions and club
--     leaderboards (they power the public viewer page). Nobody can write tables
--     directly; every write goes through a SECURITY DEFINER function below.
--   * Staff sign in with a club slug + password. The password is hashed with
--     bcrypt (pgcrypto). Login returns a random token; only its SHA-256 hash is
--     stored, it expires after 30 days, and the password never stays on a device.
--   * clubs, club_tokens and session_backups have no policies and no grants, so
--     the anon key cannot read them at all.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- tables

create table public.clubs (
  slug          text primary key
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  name          text not null check (char_length(name) between 1 and 80),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table public.club_tokens (
  token_hash text primary key,
  club_slug  text not null references public.clubs (slug) on delete cascade,
  expires_at timestamptz not null
);
create index club_tokens_expires_idx on public.club_tokens (expires_at);

-- What the public viewer page renders (no genders, no results history).
create table public.live_sessions (
  club_slug  text primary key references public.clubs (slug) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

-- The full session, so a second staff device can resume it. Never public.
create table public.session_backups (
  club_slug  text primary key references public.clubs (slug) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.club_players (
  club_slug text not null references public.clubs (slug) on delete cascade,
  name_key  text not null,
  name      text not null,
  games     integer not null default 0 check (games >= 0),
  wins      integer not null default 0 check (wins >= 0),
  losses    integer not null default 0 check (losses >= 0),
  primary key (club_slug, name_key)
);

-- Makes retrying a lifetime upload safe: a batch id is only ever applied once.
create table public.lifetime_batches (
  club_slug text not null references public.clubs (slug) on delete cascade,
  batch_id  uuid not null,
  primary key (club_slug, batch_id)
);

-- ---------------------------------------------------------------- RLS

alter table public.clubs            enable row level security;
alter table public.club_tokens      enable row level security;
alter table public.live_sessions    enable row level security;
alter table public.session_backups  enable row level security;
alter table public.club_players     enable row level security;
alter table public.lifetime_batches enable row level security;

create policy live_sessions_public_read on public.live_sessions
  for select to anon, authenticated using (true);
create policy club_players_public_read on public.club_players
  for select to anon, authenticated using (true);

revoke all on public.clubs, public.club_tokens, public.session_backups,
              public.lifetime_batches, public.live_sessions, public.club_players
  from anon, authenticated;
grant select on public.live_sessions, public.club_players to anon, authenticated;

-- ---------------------------------------------------------------- helpers (private schema)

create function private.issue_token(p_slug text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  delete from public.club_tokens where expires_at < now();
  insert into public.club_tokens (token_hash, club_slug, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), p_slug, now() + interval '30 days');
  return v_token;
end $$;

create function private.club_from_token(p_token text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select club_slug
  from public.club_tokens
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and expires_at > now();
$$;

-- ---------------------------------------------------------------- public API (RPC)

create function public.create_club(p_name text, p_slug text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_slug text := lower(trim(p_slug));
begin
  if p_password is null or char_length(p_password) < 4 then
    raise exception 'weak_password';
  end if;
  begin
    insert into public.clubs (slug, name, password_hash)
    values (v_slug, trim(p_name), crypt(p_password, gen_salt('bf')));
  exception
    when unique_violation then raise exception 'club_slug_taken';
    when check_violation then raise exception 'invalid_club';
  end;
  return private.issue_token(v_slug);
end $$;

create function public.club_login(p_slug text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_slug text := lower(trim(p_slug));
begin
  if not exists (
    select 1 from public.clubs
    where slug = v_slug and password_hash = crypt(coalesce(p_password, ''), password_hash)
  ) then
    perform pg_sleep(0.5); -- slows down password guessing
    raise exception 'invalid_credentials';
  end if;
  return private.issue_token(v_slug);
end $$;

create function public.club_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from public.club_tokens
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create function public.club_name(p_slug text) returns text
language sql stable security definer set search_path = public as $$
  select name from public.clubs where slug = lower(trim(p_slug));
$$;

create function public.publish_session(p_token text, p_public jsonb, p_full jsonb)
returns timestamptz
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_slug text := private.club_from_token(p_token);
  v_now  timestamptz := now();
begin
  if v_slug is null then raise exception 'invalid_token'; end if;
  if pg_column_size(p_public) > 262144 or pg_column_size(p_full) > 262144 then
    raise exception 'snapshot_too_large';
  end if;
  insert into public.live_sessions (club_slug, state, updated_at)
  values (v_slug, p_public, v_now)
  on conflict (club_slug) do update set state = excluded.state, updated_at = excluded.updated_at;
  insert into public.session_backups (club_slug, state, updated_at)
  values (v_slug, p_full, v_now)
  on conflict (club_slug) do update set state = excluded.state, updated_at = excluded.updated_at;
  return v_now;
end $$;

create function public.fetch_full_session(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_slug text := private.club_from_token(p_token);
begin
  if v_slug is null then raise exception 'invalid_token'; end if;
  return (select state from public.session_backups where club_slug = v_slug);
end $$;

create function public.clear_session(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_slug text := private.club_from_token(p_token);
begin
  if v_slug is null then raise exception 'invalid_token'; end if;
  delete from public.live_sessions   where club_slug = v_slug;
  delete from public.session_backups where club_slug = v_slug;
end $$;

-- p_players: [{ "name": "Ann", "games": 4, "wins": 3, "losses": 1 }, ...]
create function public.record_lifetime(p_token text, p_batch uuid, p_players jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_slug text := private.club_from_token(p_token);
  v_row  record;
begin
  if v_slug is null then raise exception 'invalid_token'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 500 then
    raise exception 'invalid_players';
  end if;

  insert into public.lifetime_batches (club_slug, batch_id) values (v_slug, p_batch)
  on conflict do nothing;
  if not found then return; end if; -- this batch was already applied

  for v_row in
    select * from jsonb_to_recordset(p_players) as x(name text, games int, wins int, losses int)
  loop
    if v_row.name is null or char_length(trim(v_row.name)) = 0
       or coalesce(v_row.games, 0) < 0 or coalesce(v_row.wins, 0) < 0 or coalesce(v_row.losses, 0) < 0 then
      raise exception 'invalid_players';
    end if;
    insert into public.club_players (club_slug, name_key, name, games, wins, losses)
    values (v_slug, lower(trim(v_row.name)), trim(v_row.name),
            coalesce(v_row.games, 0), coalesce(v_row.wins, 0), coalesce(v_row.losses, 0))
    on conflict (club_slug, name_key) do update
      set games  = public.club_players.games  + excluded.games,
          wins   = public.club_players.wins   + excluded.wins,
          losses = public.club_players.losses + excluded.losses,
          name   = excluded.name;
  end loop;
end $$;

-- ---------------------------------------------------------------- function privileges

revoke all on function
  private.issue_token(text),
  private.club_from_token(text),
  public.create_club(text, text, text),
  public.club_login(text, text),
  public.club_logout(text),
  public.club_name(text),
  public.publish_session(text, jsonb, jsonb),
  public.fetch_full_session(text),
  public.clear_session(text),
  public.record_lifetime(text, uuid, jsonb)
from public;

grant execute on function
  public.create_club(text, text, text),
  public.club_login(text, text),
  public.club_logout(text),
  public.club_name(text),
  public.publish_session(text, jsonb, jsonb),
  public.fetch_full_session(text),
  public.clear_session(text),
  public.record_lifetime(text, uuid, jsonb)
to anon, authenticated;

-- ---------------------------------------------------------------- realtime

-- Viewers subscribe to changes on live_sessions. Skipped where Supabase Realtime is absent.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_sessions;
  end if;
end $$;
