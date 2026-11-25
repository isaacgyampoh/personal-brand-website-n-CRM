-- Row Level Security.
--
-- Architecture: the browser never talks to PostgreSQL or the Supabase Data API
-- directly. All reads and writes go through server-side code that performs
-- authorisation checks and connects with a privileged server role.
--
-- Defence in depth: RLS is enabled on every table with NO permissive policies
-- for the `anon` and `authenticated` roles, and all privileges are revoked
-- from them. If the Supabase anon key were ever exposed or misused, the Data
-- API would return nothing.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
