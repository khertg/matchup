-- Security and behaviour checks for 0001_init.sql. Any failed check aborts the run.
-- Each statement runs as the given role, exactly as the anon key would.
\set ON_ERROR_STOP on
\set QUIET on

create schema t;

create function t.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;

-- Run a query as a role and return its first column as text.
create function t.scalar(p_role text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  execute p_sql into v;
  reset role;
  return v;
end $$;

-- Run a statement as a role, discarding any result.
create function t.exec(p_role text, p_sql text) returns void language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
end $$;

-- The statement must fail, with an error message containing p_msg.
create function t.expect_error(p_role text, p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
  exception when others then
    reset role;
    if position(p_msg in sqlerrm) = 0 then
      raise exception 'WRONG ERROR for [%]: expected "%", got "%"', p_sql, p_msg, sqlerrm;
    end if;
    return;
  end;
  reset role;
  raise exception 'EXPECTED ERROR "%" but it succeeded: %', p_msg, p_sql;
end $$;

-- Silence the result rows of the checks below; failures still abort the run.
\o /dev/null

-- ---------------------------------------------------------------- anon cannot touch tables directly

select t.expect_error('anon', 'select * from public.clubs', 'permission denied');
select t.expect_error('anon', 'select * from public.club_tokens', 'permission denied');
select t.expect_error('anon', 'select * from public.session_backups', 'permission denied');
select t.expect_error('anon', 'select * from public.lifetime_batches', 'permission denied');
select t.expect_error('anon', $$insert into public.live_sessions (club_slug, state) values ('x', '{}')$$, 'permission denied');
select t.expect_error('anon', $$update public.live_sessions set state = '{}'$$, 'permission denied');
select t.expect_error('anon', $$delete from public.club_players$$, 'permission denied');
select t.expect_error('anon', $$insert into public.club_players (club_slug, name_key, name) values ('x', 'a', 'a')$$, 'permission denied');
select t.expect_error('anon', $$select private.club_from_token('x')$$, 'permission denied');
select t.expect_error('anon', $$select private.issue_token('downtown-club')$$, 'permission denied');

-- ---------------------------------------------------------------- creating a club

select t.scalar('anon', $$select public.create_club('Downtown Club', 'downtown-club', 'secret')$$) as token \gset
select t.assert(length(:'token') = 64, 'token is 32 random bytes as hex');

select t.expect_error('anon', $$select public.create_club('Other', 'downtown-club', 'secret')$$, 'club_slug_taken');
select t.expect_error('anon', $$select public.create_club('Other', 'DOWNTOWN-CLUB', 'secret')$$, 'club_slug_taken');
select t.expect_error('anon', $$select public.create_club('Short', 'short-pw', 'abc')$$, 'weak_password');
select t.expect_error('anon', $$select public.create_club('Bad', 'Bad Slug!', 'secret')$$, 'invalid_club');
select t.expect_error('anon', $$select public.create_club('Tiny', 'ab', 'secret')$$, 'invalid_club');

select t.assert(
  (select password_hash from public.clubs where slug = 'downtown-club') like '$2%',
  'password is stored as a bcrypt hash');
select t.assert(
  (select password_hash from public.clubs where slug = 'downtown-club') <> 'secret',
  'password is never stored in plain text');
select t.assert(
  not exists (select 1 from public.club_tokens where token_hash = :'token'),
  'the raw token is never stored, only its hash');
select t.assert(
  t.scalar('anon', $$select public.club_name('Downtown-Club')$$) = 'Downtown Club',
  'club_name looks the club up regardless of case');

-- ---------------------------------------------------------------- logging in

select t.expect_error('anon', $$select public.club_login('downtown-club', 'wrong')$$, 'invalid_credentials');
select t.expect_error('anon', $$select public.club_login('no-such-club', 'secret')$$, 'invalid_credentials');
select t.scalar('anon', $$select public.club_login(' Downtown-Club ', 'secret')$$) as token2 \gset
select t.assert(:'token2' <> :'token', 'every login issues a fresh token');

-- ---------------------------------------------------------------- publishing a live session

select t.exec('anon', format(
  $f$select public.publish_session(%L, %L::jsonb, %L::jsonb)$f$,
  :'token', '{"location":"Downtown","courts":[]}', '{"secret":"private gender data"}'));

select t.assert(
  t.scalar('anon', $$select state->>'location' from public.live_sessions where club_slug = 'downtown-club'$$) = 'Downtown',
  'anyone can read the public live session');
select t.assert(
  t.scalar('anon', format($f$select public.fetch_full_session(%L)->>'secret'$f$, :'token')) = 'private gender data',
  'the full session comes back only with a valid token');
select t.assert(
  not exists (select 1 from public.live_sessions where state::text like '%private gender data%'),
  'the private session never lands in the public table');

select t.expect_error('anon', $$select public.publish_session('bogus', '{}', '{}')$$, 'invalid_token');
select t.expect_error('anon', $$select public.fetch_full_session('bogus')$$, 'invalid_token');
select t.expect_error('anon', $$select public.clear_session('bogus')$$, 'invalid_token');
select t.expect_error('anon', $$select public.record_lifetime('bogus', gen_random_uuid(), '[]')$$, 'invalid_token');
select t.expect_error('anon', $$select public.publish_session(null, '{}', '{}')$$, 'invalid_token');

select t.expect_error('anon', format(
  $f$select public.publish_session(%L, %L::jsonb, '{}')$f$,
  :'token', (select jsonb_build_object('x', repeat('a', 300000))::text)), 'snapshot_too_large');

-- Publishing again replaces the row instead of adding one.
select t.exec('anon', format(
  $f$select public.publish_session(%L, '{"location":"Second"}'::jsonb, '{}'::jsonb)$f$, :'token'));
select t.assert((select count(*) from public.live_sessions) = 1, 'one live session per club');
select t.assert(
  t.scalar('anon', $$select state->>'location' from public.live_sessions$$) = 'Second',
  'the latest publish wins');

-- ---------------------------------------------------------------- lifetime leaderboard

select t.exec('anon', format(
  $f$select public.record_lifetime(%L, %L::uuid, %L::jsonb)$f$,
  :'token', '11111111-1111-1111-1111-111111111111',
  '[{"name":"Ann","games":4,"wins":3,"losses":1},{"name":" Bob ","games":4,"wins":1,"losses":3}]'));
select t.assert(
  (select games from public.club_players where name_key = 'ann') = 4, 'first batch records games');

-- Retrying the same batch (for example after a lost response) must not double count.
select t.exec('anon', format(
  $f$select public.record_lifetime(%L, %L::uuid, %L::jsonb)$f$,
  :'token', '11111111-1111-1111-1111-111111111111',
  '[{"name":"Ann","games":4,"wins":3,"losses":1}]'));
select t.assert(
  (select games from public.club_players where name_key = 'ann') = 4, 'a repeated batch is ignored');

-- A new batch adds on top, and names match ignoring case and spaces.
select t.exec('anon', format(
  $f$select public.record_lifetime(%L, %L::uuid, %L::jsonb)$f$,
  :'token', '22222222-2222-2222-2222-222222222222',
  '[{"name":"ANN","games":2,"wins":2,"losses":0}]'));
select t.assert(
  (select games || '/' || wins || '/' || losses from public.club_players where name_key = 'ann') = '6/5/1',
  'totals accumulate across batches');
select t.assert(
  (select count(*) from public.club_players) = 2, 'names are merged case-insensitively');
select t.assert(
  t.scalar('anon', $$select name from public.club_players where name_key = 'bob'$$) = 'Bob',
  'anyone can read the leaderboard and names are trimmed');

select t.expect_error('anon', format(
  $f$select public.record_lifetime(%L, gen_random_uuid(), %L::jsonb)$f$,
  :'token', '[{"name":"Ann","games":-1,"wins":0,"losses":0}]'), 'invalid_players');
select t.expect_error('anon', format(
  $f$select public.record_lifetime(%L, gen_random_uuid(), %L::jsonb)$f$,
  :'token', '{"not":"an array"}'), 'invalid_players');

-- ---------------------------------------------------------------- expiry, logout, clearing

update public.club_tokens
set expires_at = now() - interval '1 day'
where token_hash = encode(extensions.digest(:'token2', 'sha256'), 'hex');
select t.expect_error('anon', format(
  $f$select public.publish_session(%L, '{}', '{}')$f$, :'token2'), 'invalid_token');

select t.exec('anon', format($f$select public.clear_session(%L)$f$, :'token'));
select t.assert((select count(*) from public.live_sessions) = 0, 'clearing removes the live session');
select t.assert((select count(*) from public.session_backups) = 0, 'clearing removes the backup');

select t.exec('anon', format($f$select public.club_logout(%L)$f$, :'token'));
select t.expect_error('anon', format(
  $f$select public.publish_session(%L, '{}', '{}')$f$, :'token'), 'invalid_token');

\o
select 'All database checks passed' as result;
