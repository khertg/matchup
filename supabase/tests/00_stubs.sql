-- Stand-ins for what Supabase provides, so the migration can run on plain Postgres.
create role anon nologin;
create role authenticated nologin;
create schema extensions;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
